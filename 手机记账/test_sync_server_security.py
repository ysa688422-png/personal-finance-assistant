"""Pure local request-policy tests; never binds a socket or starts the service."""

from http.server import BaseHTTPRequestHandler
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock
from contextlib import redirect_stdout
import importlib.util
import io
import stat


MODULE_PATH = Path(__file__).with_name("sync-server.py")
SPEC = importlib.util.spec_from_file_location("sayi_sync_server_security_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)
TEST_TOKEN = "A" * 43


def fake_handler(handler_type, path, client_ip="192.0.2.23", headers=None):
    handler = handler_type.__new__(handler_type)
    handler.path = path
    handler.client_address = (client_ip, 12345)
    handler.headers = headers or {}
    handler.wfile = io.BytesIO()
    handler.send_response = mock.Mock()
    handler.send_header = mock.Mock()
    handler.end_headers = mock.Mock()
    handler.send_error = mock.Mock()
    handler.send_json = mock.Mock()
    return handler


class SyncServerSecurityTests(TestCase):
    def test_lan_get_and_post_require_pairing(self):
        get = fake_handler(server.Handler, "/api/records")
        server.Handler.do_GET(get)
        get.send_error.assert_called_once_with(403)

        post = fake_handler(server.Handler, "/api/reset-mobile-ledger")
        with mock.patch.object(server, "reset_mobile_ledger") as reset:
            server.Handler.do_POST(post)
        post.send_error.assert_called_once_with(403)
        reset.assert_not_called()

        options = fake_handler(server.Handler, "/api/sync")
        server.Handler.do_OPTIONS(options)
        options.send_error.assert_called_once_with(403)

    def test_pairing_loads_same_site_page_outside_service_worker_scope(self):
        handler = fake_handler(server.Handler, f"/pair?token={TEST_TOKEN}")
        with mock.patch.object(server, "get_pairing_token", return_value=TEST_TOKEN):
            server.Handler.do_GET(handler)
        handler.send_response.assert_called_once_with(200)
        headers = dict(call.args for call in handler.send_header.call_args_list)
        body = handler.wfile.getvalue().decode("utf-8")
        self.assertIn('history.replaceState(null, "", "/pair")', body)
        self.assertIn('location.replace("/voice-ledger-stable/index.html")', body)
        self.assertIn('href="/voice-ledger-stable/index.html"', body)
        self.assertNotIn(TEST_TOKEN, body)
        self.assertIn("Secure", headers["Set-Cookie"])
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.assertEqual(headers["Cache-Control"], "no-store")

        bad = fake_handler(server.Handler, "/pair?token=wrong")
        with mock.patch.object(server, "get_pairing_token", return_value=TEST_TOKEN):
            server.Handler.do_GET(bad)
        bad.send_error.assert_called_once_with(403)

    def test_static_routes_never_expose_secret_files_or_escape_roots(self):
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = workspace / "site"
            root.mkdir()
            cert_dir = root / "https-cert"
            cert_dir.mkdir()
            (root / "safe.html").write_text("safe", encoding="utf-8")
            (root / ".env").write_text("hidden", encoding="utf-8")
            (root / "sync-server.py").write_text("private", encoding="utf-8")
            (root / "receiver.log").write_text("private", encoding="utf-8")
            (cert_dir / "mobile-ledger-local-ca.key").write_text("private", encoding="utf-8")
            (cert_dir / "mobile-ledger-local-ca.pem").write_text("public CA only via 4176", encoding="utf-8")
            (cert_dir / ".mobile-ledger-pairing-token").write_text("private", encoding="utf-8")
            outside = workspace / "site-secret"
            outside.mkdir()
            (outside / "leak.html").write_text("private", encoding="utf-8")
            (root / "alias").symlink_to(outside, target_is_directory=True)
            (root / "cert-alias").symlink_to(cert_dir, target_is_directory=True)
            with mock.patch.object(server, "ROOT", root), \
                    mock.patch.object(server, "CERT_DIR", cert_dir):
                safe = fake_handler(server.Handler, "/safe.html")
                server.Handler.serve_static(safe, "/safe.html")
                safe.send_response.assert_called_once_with(200)
                self.assertEqual(safe.wfile.getvalue(), b"safe")

                private_paths = (
                    "/.env", "/sync-server.py", "/receiver.log",
                    "/https-cert/mobile-ledger-local-ca.key",
                    "/https-cert/mobile-ledger-local-ca.pem",
                    "/https-cert/.mobile-ledger-pairing-token",
                    "/cert-alias/.mobile-ledger-pairing-token",
                    "/cert-alias/mobile-ledger-local-ca.key",
                    "/alias/leak.html",
                    "/../site-secret/leak.html",
                )
                for path in private_paths:
                    with self.subTest(path=path):
                        private = fake_handler(server.Handler, path)
                        server.Handler.serve_static(private, path)
                        private.send_error.assert_called_once_with(404)
                        private.send_response.assert_not_called()

    def test_paired_cookie_allows_lan_read(self):
        handler = fake_handler(
            server.Handler,
            "/api/records",
            headers={"Cookie": f"{server.PAIRING_COOKIE}={TEST_TOKEN}"},
        )
        with mock.patch.object(server, "get_pairing_token", return_value=TEST_TOKEN), \
                mock.patch.object(server, "load_existing_records", return_value=[]), \
                mock.patch.object(server, "load_deletions", return_value=[]), \
                mock.patch.object(server, "load_reset_at", return_value=""):
            server.Handler.do_GET(handler)
        handler.send_error.assert_not_called()
        handler.send_json.assert_called_once()

    def test_lan_post_requires_same_origin_even_when_paired(self):
        base_headers = {
            "Cookie": f"{server.PAIRING_COOKIE}={TEST_TOKEN}",
            "Host": "192.0.2.7:4175",
        }
        with mock.patch.object(server, "get_pairing_token", return_value=TEST_TOKEN), \
                mock.patch.object(server, "reset_mobile_ledger", return_value={"ok": True}) as reset:
            missing = fake_handler(server.Handler, "/api/reset-mobile-ledger", headers=base_headers)
            server.Handler.do_POST(missing)
            missing.send_error.assert_called_once_with(403)

            cross = fake_handler(server.Handler, "/api/reset-mobile-ledger", headers={
                **base_headers, "Origin": "https://other.example",
            })
            server.Handler.do_POST(cross)
            cross.send_error.assert_called_once_with(403)

            valid = fake_handler(server.Handler, "/api/reset-mobile-ledger", headers={
                **base_headers, "Origin": "https://192.0.2.7:4175",
            })
            server.Handler.do_POST(valid)
            valid.send_error.assert_not_called()
            valid.send_json.assert_called_once_with({"ok": True})
            reset.assert_called_once()

    def test_loopback_keeps_desktop_access(self):
        get = fake_handler(server.Handler, "/api/records", client_ip="127.0.0.1")
        with mock.patch.object(server, "load_existing_records", return_value=[]), \
                mock.patch.object(server, "load_deletions", return_value=[]), \
                mock.patch.object(server, "load_reset_at", return_value=""):
            server.Handler.do_GET(get)
        get.send_error.assert_not_called()
        get.send_json.assert_called_once()

        post = fake_handler(server.Handler, "/api/sync", client_ip="127.0.0.1")
        with mock.patch.object(server, "load_existing_records", return_value=[]):
            server.Handler.do_POST(post)
        post.send_error.assert_not_called()
        self.assertTrue(post.send_json.call_args.args[0]["ignored"])

        cross_site = fake_handler(
            server.Handler,
            "/api/reset-mobile-ledger",
            client_ip="127.0.0.1",
            headers={"Origin": "https://other.example", "Sec-Fetch-Site": "cross-site"},
        )
        with mock.patch.object(server, "reset_mobile_ledger") as reset:
            server.Handler.do_POST(cross_site)
        cross_site.send_error.assert_called_once_with(403)
        reset.assert_not_called()

    def test_http_certificate_port_is_ca_only_for_lan(self):
        with TemporaryDirectory() as directory:
            cert_path = Path(directory) / "ca.pem"
            cert_path.write_bytes(b"test-public-certificate")
            with mock.patch.object(server, "CA_CERT", cert_path):
                cert = fake_handler(server.CertHandler, "/mobile-ledger-local-ca.pem")
                server.CertHandler.do_GET(cert)
                cert.send_response.assert_called_once_with(200)
                self.assertEqual(cert.wfile.getvalue(), b"test-public-certificate")

                for path in ("/", "/home.html", "/api/records", "/pair"):
                    other = fake_handler(server.CertHandler, path)
                    server.CertHandler.do_GET(other)
                    other.send_error.assert_called_once_with(403)

                post = fake_handler(server.CertHandler, "/api/sync")
                server.CertHandler.do_POST(post)
                post.send_error.assert_called_once_with(403)

                options = fake_handler(server.CertHandler, "/api/sync")
                server.CertHandler.do_OPTIONS(options)
                options.send_error.assert_called_once_with(403)

    def test_no_wildcard_cors(self):
        handler = fake_handler(server.Handler, "/api/status")
        with mock.patch.object(BaseHTTPRequestHandler, "end_headers"):
            server.Handler.end_headers(handler)
        names = [call.args[0] for call in handler.send_header.call_args_list]
        self.assertNotIn("Access-Control-Allow-Origin", names)

    def test_pairing_token_is_persistent_and_owner_only(self):
        with TemporaryDirectory() as directory:
            token_path = Path(directory) / "pairing-token"
            with mock.patch.object(server, "PAIRING_TOKEN_FILE", token_path), \
                    mock.patch.object(server, "_PAIRING_TOKEN", None):
                first = server.get_pairing_token()
                self.assertEqual(len(first), 43)
                self.assertEqual(stat.S_IMODE(token_path.stat().st_mode), 0o600)
                server._PAIRING_TOKEN = None
                second = server.get_pairing_token()
                self.assertTrue(server.hmac.compare_digest(first, second))

    def test_keyboard_interrupt_closes_both_sockets(self):
        cert_listener = mock.Mock()
        main_listener = mock.Mock()
        main_listener.serve_forever.side_effect = KeyboardInterrupt()
        with mock.patch.object(server, "ensure_https_cert"), \
                mock.patch.object(server, "get_pairing_token", return_value=TEST_TOKEN), \
                mock.patch.object(server, "ReusableThreadingHTTPServer", side_effect=[cert_listener, main_listener]) as listen, \
                mock.patch.object(server.ssl, "SSLContext"), \
                mock.patch.object(server.threading, "Thread"), \
                mock.patch.object(server, "local_ips", return_value=[]), \
                mock.patch.object(server, "BIND_HOST", "127.0.0.1"), \
                redirect_stdout(io.StringIO()):
            server.start_server()
        self.assertEqual(listen.call_args_list[0].args[0], ("127.0.0.1", server.CERT_PORT))
        self.assertEqual(listen.call_args_list[1].args[0], ("127.0.0.1", server.FIXED_PORT))
        main_listener.server_close.assert_called_once()
        cert_listener.shutdown.assert_called_once()
        cert_listener.server_close.assert_called_once()


if __name__ == "__main__":
    main()
