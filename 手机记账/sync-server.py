#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import CookieError, SimpleCookie
from pathlib import Path
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request as UpstreamRequest, build_opener, ProxyHandler, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
INVESTMENT_DIR_NAME = "洒一投资工具箱"
LEGACY_INVESTMENT_DIR_NAME = "洒一投资工具箱_自动汇率刷新修复版"
INVESTMENT_DIR = WORKSPACE / INVESTMENT_DIR_NAME
OUT_DIR = WORKSPACE / "财务管理" / "手机记账同步"
ANALYSIS_DIR = WORKSPACE / "数据备份" / "支出与收入流水" / "Codex分析包"
STOCK_ANALYSIS_DIR = WORKSPACE / "数据备份" / INVESTMENT_DIR_NAME / "Codex持仓分析包"
ASSISTANT_APP = WORKSPACE / "个人财务助理" / "桌面应用" / "洒一财务助理.app"
ASSISTANT_PORT = 4188
RESET_FILE = OUT_DIR / "手机记账-重置标记.json"
DELETIONS_FILE = OUT_DIR / "手机记账-删除记录.json"
VOICE_TEST_SYNC_FILE = OUT_DIR / "手机语音记账测试版-同步数据.json"
MIGRATION_DIR = WORKSPACE / "数据备份" / "浏览器旧数据迁移"
MIGRATION_FILE = MIGRATION_DIR / "latest-browser-data.json"
CERT_DIR = ROOT / "https-cert"
CA_KEY = CERT_DIR / "mobile-ledger-local-ca.key"
CA_CERT = CERT_DIR / "mobile-ledger-local-ca.pem"
SERVER_KEY = CERT_DIR / "mobile-ledger-server.key"
SERVER_CSR = CERT_DIR / "mobile-ledger-server.csr"
SERVER_CERT = CERT_DIR / "mobile-ledger-server.pem"
PAIRING_TOKEN_FILE = CERT_DIR / ".mobile-ledger-pairing-token"
PAIRING_COOKIE = "__Host-sayi-mobile-ledger"
FIXED_PORT = int(os.environ.get("PORT", "4175"))
CERT_PORT = int(os.environ.get("CERT_PORT", "4176"))
BIND_HOST = os.environ.get("SAYI_BIND_HOST", "127.0.0.1").strip() or "127.0.0.1"
SERVER_VERSION = "20260905-stable-receiver"
_PAIRING_TOKEN = None
_PAIRING_TOKEN_LOCK = threading.Lock()


class RejectGatewayRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        raise HTTPError(request.full_url, code, "local gateway redirects are disabled", headers, file_pointer)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
SYNC_SESSION_TTL_SECONDS = 600

SYNC_SESSIONS = {}
SYNC_SESSION_LOCK = threading.Lock()

OUT_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
STOCK_ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
MIGRATION_DIR.mkdir(parents=True, exist_ok=True)
CERT_DIR.mkdir(parents=True, exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_OPTIONS(self):
        if not self.is_loopback_client():
            self.send_error(403)
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/longbridge/"):
            self.relay_longbridge()
            return
        if not self.is_loopback_client():
            if path == "/pair":
                self.pair_mobile_client()
                return
            if not self.mobile_cookie_valid():
                self.send_error(403)
                return
        if path == "/launch-finance-assistant":
            fetch_site = self.headers.get("Sec-Fetch-Site", "")
            referer = self.headers.get("Referer", "")
            if (not self.is_loopback_client()
                    or fetch_site == "cross-site"
                    or (referer and not referer.startswith(("http://127.0.0.1:4176/", "http://localhost:4176/", "https://127.0.0.1:4175/", "https://localhost:4175/")))):
                self.send_error(403)
                return
            wants_json = "application/json" in self.headers.get("Accept", "")
            try:
                open_finance_assistant()
                if wants_json:
                    self.send_json({"ok": True})
                else:
                    self.send_html(assistant_launch_page(True))
            except (OSError, subprocess.SubprocessError):
                if wants_json:
                    self.send_json({"ok": False, "error": "财务助理暂时无法打开，请检查应用是否存在。"}, 503)
                else:
                    self.send_html(assistant_launch_page(False), 503)
            return
        if path == "/api/assistant-status":
            self.send_json({
                "ok": True,
                "running": assistant_is_running(),
                "url": f"http://127.0.0.1:{ASSISTANT_PORT}/",
            })
            return
        if path == "/api/status":
            urls = local_urls(FIXED_PORT)
            self.send_json({
                "ok": True,
                "app": "手机记账同步接收器",
                "version": SERVER_VERSION,
                "records": len(load_existing_records()),
                "savedAt": latest_sync_saved_at(),
                "port": FIXED_PORT,
                "certPort": CERT_PORT,
                "localUrls": urls,
                "recommendedUrl": urls[0] if urls else "",
            })
            return
        if path == "/api/records":
            self.send_json({
                "ok": True,
                "app": "手机记账",
                "records": load_existing_records(),
                "deletions": load_deletions(),
                "resetAt": load_reset_at(),
            })
            return
        if path == "/api/voice-test-records":
            self.send_json(load_voice_test_sync())
            return
        if path == "/api/migration/latest":
            self.send_json(load_migration_payload())
            return
        self.serve_static(path)

    def do_POST(self):
        if self.is_loopback_client():
            origin = self.headers.get("Origin", "")
            allowed = {
                f"http://localhost:{CERT_PORT}",
                f"http://127.0.0.1:{CERT_PORT}",
                f"https://localhost:{FIXED_PORT}",
                f"https://127.0.0.1:{FIXED_PORT}",
            }
            if self.headers.get("Sec-Fetch-Site", "") == "cross-site" or (origin and origin not in allowed):
                self.send_error(403)
                return
        elif not self.mobile_cookie_valid() or not self.mobile_origin_valid():
            self.send_error(403)
            return
        path = urlparse(self.path).path
        if path == "/api/migration":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                result = save_migration_payload(payload)
                self.send_json(result)
            except Exception as error:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False).encode("utf-8"))
            return
        if path == "/api/reset-mobile-ledger":
            self.send_json(reset_mobile_ledger())
            return
        if path == "/api/voice-test-sync":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                self.send_json(save_voice_test_sync(payload))
            except Exception as error:
                self.send_json({"ok": False, "error": str(error)}, status=500)
            return
        if path == "/api/codex-analysis":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                result = save_codex_analysis(payload)
                self.send_json(result)
            except Exception as error:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False).encode("utf-8"))
            return
        if path == "/api/codex-stock-analysis":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                result = save_codex_stock_analysis(payload)
                self.send_json(result)
            except Exception as error:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False).encode("utf-8"))
            return
        if path != "/api/sync":
            self.send_error(404)
            return
        client_ip = self.client_address[0] if self.client_address else ""
        try:
            is_computer_page = ipaddress.ip_address(client_ip).is_loopback
        except ValueError:
            is_computer_page = client_ip in {"localhost", ""}
        if is_computer_page:
            existing_records = load_existing_records()
            self.send_json({
                "ok": True,
                "ignored": True,
                "reason": "computer-page-read-only",
                "totalRecords": len(existing_records),
                "latestDate": max((item.get("date", "") for item in existing_records), default=""),
            })
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            chunk = payload.get("chunk") if isinstance(payload.get("chunk"), dict) else {}
            chunk_text = ""
            if chunk:
                chunk_text = f" 第 {int(chunk.get('chunkIndex', 0)) + 1}/{chunk.get('totalChunks', '?')} 块"
            incoming_records = payload.get("records", []) if isinstance(payload.get("records"), list) else []
            latest_date = max((str(item.get("date") or "") for item in incoming_records if isinstance(item, dict)), default="")
            print(f"收到手机 {client_ip} 同步请求{chunk_text}：{len(incoming_records)} 条，最新日期 {latest_date or '-'}")
            sys.stdout.flush()
            result = save_sync_payload(payload)
            self.send_json(result)
        except Exception as error:
            print(f"手机同步失败：{error}")
            sys.stdout.flush()
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False).encode("utf-8"))

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html, status=200):
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.end_headers()
        self.wfile.write(body)

    def is_loopback_client(self):
        client_ip = self.client_address[0] if self.client_address else ""
        try:
            return ipaddress.ip_address(client_ip).is_loopback
        except ValueError:
            return client_ip in {"localhost", ""}

    def mobile_cookie_valid(self):
        try:
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
            cookie = cookies.get(PAIRING_COOKIE)
            return bool(cookie and hmac.compare_digest(cookie.value, get_pairing_token()))
        except (CookieError, ValueError):
            return False

    def mobile_origin_valid(self):
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "")
        if not origin or not host or self.headers.get("Sec-Fetch-Site", "") == "cross-site":
            return False
        parsed = urlparse(origin)
        return (parsed.scheme == "https" and parsed.netloc.lower() == host.lower()
                and parsed.path == "" and parsed.params == "" and parsed.query == "" and parsed.fragment == "")

    def pair_mobile_client(self):
        values = parse_qs(urlparse(self.path).query, keep_blank_values=True).get("token", [])
        token = get_pairing_token()
        if len(values) != 1 or not hmac.compare_digest(values[0], token):
            self.send_error(403)
            return
        # First load a same-site document. A direct 303 from another app/site can
        # omit SameSite=Strict cookies on the redirected navigation in Safari.
        body = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>手机记账配对成功</title></head><body>
<main><h1>配对成功</h1><p>正在打开手机记账…</p>
<a href="/voice-ledger-stable/index.html">如果没有自动打开，请点这里进入</a></main>
<script>try { history.replaceState(null, "", "/pair"); } catch (_) {}
setTimeout(() => location.replace("/voice-ledger-stable/index.html"), 100);</script>
</body></html>""".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header(
            "Set-Cookie",
            f"{PAIRING_COOKIE}={token}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)

    def relay_longbridge(self):
        """Only loopback reads can reach the separately started Longbridge gateway."""
        allowed = {"status", "quotes", "option-quotes", "positions", "exchange-rates", "ipo-calendar", "offers"}
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin", "")
        valid_hosts = {f"{name}:{port}" for name in ("127.0.0.1", "localhost") for port in (FIXED_PORT, CERT_PORT)}
        if (not self.is_loopback_client() or host not in valid_hosts
                or self.headers.get("X-Finance-Request") != "1"
                or self.headers.get("Sec-Fetch-Site") == "cross-site"
                or (origin and origin not in {"http://" + host, "https://" + host})):
            self.send_error(403)
            return
        parsed = urlparse(self.path)
        if len(self.path) > 4096 or parsed.scheme or parsed.netloc or parsed.path.removeprefix("/api/longbridge/") not in allowed:
            self.send_error(404)
            return
        target = "http://127.0.0.1:4190" + self.path
        request = UpstreamRequest(target, headers={"X-Finance-Request": "1", "Accept": "application/json"})
        opener = build_opener(ProxyHandler({}), RejectGatewayRedirects())  # No system proxy or redirect can change the fixed local destination.
        try:
            try:
                response = opener.open(request, timeout=20)
            except HTTPError as error:
                if 300 <= error.code < 400:
                    error.close()
                    raise OSError("local gateway redirect rejected") from None
                response = error
            with response:
                payload = response.read(2 * 1024 * 1024 + 1)
                if len(payload) > 2 * 1024 * 1024:
                    raise ValueError("response too large")
                data = json.loads(payload)
                self.send_json(data, status=response.code)
        except (OSError, URLError, ValueError):
            self.send_json({"ok": False, "error": {"code": "gateway_unavailable", "message": "长桥网关未就绪，请按说明手动启动；未使用替代数据。"}}, status=503)

    def serve_static(self, raw_path):
        requested = "/index.html" if raw_path == "/" else raw_path
        decoded = unquote(requested).lstrip("/")
        if any(part.startswith(".") or part == "https-cert" for part in Path(decoded).parts):
            self.send_error(404)
            return
        if requested == "/home.html":
            file_path = (WORKSPACE / "index.html").resolve()
            allowed_root = WORKSPACE
        elif decoded == "site-auto-backup.js":
            file_path = (WORKSPACE / "site-auto-backup.js").resolve()
            allowed_root = WORKSPACE
        elif decoded == "sayi-anime-theme.css":
            file_path = (WORKSPACE / "sayi-anime-theme.css").resolve()
            allowed_root = WORKSPACE
        elif decoded in ["music-player.js", "music-player.css"]:
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE
        elif decoded.startswith("音乐/"):
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE / "音乐"
        elif decoded.startswith("品牌资产/"):
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE / "品牌资产"
        elif decoded in ["财务管理", "财务管理/"]:
            file_path = (WORKSPACE / "财务管理" / "index.html").resolve()
            allowed_root = WORKSPACE
        elif decoded.startswith("财务管理/"):
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE
        elif decoded in ["支出与收入流水", "支出与收入流水/"]:
            file_path = (WORKSPACE / "支出与收入流水" / "index.html").resolve()
            allowed_root = WORKSPACE
        elif decoded.startswith("支出与收入流水/"):
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE
        elif decoded.startswith("特殊出行与专项收支/"):
            file_path = (WORKSPACE / decoded).resolve()
            allowed_root = WORKSPACE / "特殊出行与专项收支"
        elif decoded in [INVESTMENT_DIR_NAME, f"{INVESTMENT_DIR_NAME}/", LEGACY_INVESTMENT_DIR_NAME, f"{LEGACY_INVESTMENT_DIR_NAME}/"]:
            file_path = (INVESTMENT_DIR / "index.html").resolve()
            allowed_root = INVESTMENT_DIR
        elif decoded.startswith(f"{INVESTMENT_DIR_NAME}/"):
            relative_path = decoded.removeprefix(f"{INVESTMENT_DIR_NAME}/")
            file_path = (INVESTMENT_DIR / relative_path).resolve()
            allowed_root = INVESTMENT_DIR
        elif decoded.startswith(f"{LEGACY_INVESTMENT_DIR_NAME}/"):
            relative_path = decoded.removeprefix(f"{LEGACY_INVESTMENT_DIR_NAME}/")
            file_path = (INVESTMENT_DIR / relative_path).resolve()
            allowed_root = INVESTMENT_DIR
        else:
            file_path = (ROOT / decoded).resolve()
            allowed_root = ROOT
        root = allowed_root.resolve()
        try:
            relative_path = file_path.relative_to(root)
        except ValueError:
            self.send_error(404)
            return
        blocked_suffixes = {
            ".py", ".pyc", ".pyo", ".key", ".pem", ".csr", ".srl", ".log",
            ".command", ".sh", ".plist", ".env", ".ini", ".conf", ".toml",
            ".db", ".sqlite", ".sqlite3", ".bak", ".backup", ".md",
            ".csv", ".tsv", ".xls", ".xlsx", ".doc", ".docx",
        }
        if (not relative_path.parts
                or any(part.startswith(".") or part == "https-cert" for part in relative_path.parts)
                or root == CERT_DIR.resolve() or CERT_DIR.resolve() in file_path.parents
                or file_path.suffix.lower() in blocked_suffixes
                or not file_path.is_file()):
            self.send_error(404)
            return
        data = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        if content_type.startswith("text/") or file_path.suffix in [".js", ".json", ".svg"]:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        return


class CertHandler(Handler):
    def do_GET(self):
        path = urlparse(self.path).path
        if not self.is_loopback_client() and path not in ["/mobile-ledger-local-ca.pem", "/https-cert/mobile-ledger-local-ca.pem"]:
            self.send_error(403)
            return
        if path in ["/", "/mobile-ledger-local-ca.pem", "/https-cert/mobile-ledger-local-ca.pem"]:
            data = CA_CERT.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="mobile-ledger-local-ca.pem"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self):
        if not self.is_loopback_client():
            self.send_error(403)
            return
        super().do_POST()

    def do_OPTIONS(self):
        if not self.is_loopback_client():
            self.send_error(403)
            return
        super().do_OPTIONS()

    def log_message(self, format, *args):
        return


def assistant_is_running():
    try:
        with socket.create_connection(("127.0.0.1", ASSISTANT_PORT), timeout=0.4):
            return True
    except OSError:
        return False


def open_finance_assistant():
    if not (ASSISTANT_APP / "Contents" / "MacOS" / "SayiFinanceAssistant").is_file():
        raise FileNotFoundError("财务助理应用未找到")
    subprocess.run(
        ["/usr/bin/open", "-a", str(ASSISTANT_APP)],
        check=True,
        timeout=5,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def assistant_launch_page(opened):
    message = "财务助理已在独立窗口打开。关闭那个窗口，服务会随之停止。" if opened else "财务助理暂时无法打开，请检查应用是否存在。"
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>洒一财务助理</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff7fb;color:#2b2335;font-family:"PingFang SC",sans-serif}
    main{text-align:center;padding:32px}.mark{font-size:52px;color:#ff4f9a}h1{font-size:28px;margin:12px 0}p{color:#7a6f8e;line-height:1.7}
  </style>
</head>
<body><main><div class="mark">✦</div><h1>洒一财务助理</h1><p>""" + message + """</p></main></body></html>"""


def save_sync_payload(payload):
    chunk = payload.get("chunk") if isinstance(payload.get("chunk"), dict) else None
    if chunk and chunk.get("fullSync") and safe_int(chunk.get("totalChunks"), 1) > 1:
        return save_sync_chunk(payload, chunk)
    return save_full_sync_records(payload.get("records", []), chunk, payload.get("deletions", []))


def save_sync_chunk(payload, chunk):
    sync_id = str(chunk.get("syncId") or payload.get("syncedAt") or "default")
    chunk_index = safe_int(chunk.get("chunkIndex"), 0)
    total_chunks = max(1, safe_int(chunk.get("totalChunks"), 1))
    expected_records = max(0, safe_int(chunk.get("totalRecords"), 0))
    records = payload.get("records", [])
    if not isinstance(records, list):
        records = []

    ready_records = None
    now = time.time()
    with SYNC_SESSION_LOCK:
        expired = [key for key, value in SYNC_SESSIONS.items() if now - value.get("createdAt", now) > SYNC_SESSION_TTL_SECONDS]
        for key in expired:
            SYNC_SESSIONS.pop(key, None)

        session = SYNC_SESSIONS.setdefault(sync_id, {
            "createdAt": now,
            "totalChunks": total_chunks,
            "totalRecords": expected_records,
            "chunks": {},
            "deletions": [],
        })
        session["totalChunks"] = max(total_chunks, safe_int(session.get("totalChunks"), total_chunks))
        session["totalRecords"] = max(expected_records, safe_int(session.get("totalRecords"), expected_records))
        session["chunks"][chunk_index] = records
        if isinstance(payload.get("deletions"), list):
            session["deletions"] = payload["deletions"]

        missing = [index for index in range(session["totalChunks"]) if index not in session["chunks"]]
        received_records = sum(len(items) for items in session["chunks"].values())
        if missing:
            return {
                "ok": True,
                "pending": True,
                "chunk": chunk,
                "syncId": sync_id,
                "receivedChunks": len(session["chunks"]),
                "totalChunks": session["totalChunks"],
                "receivedRecords": received_records,
                "totalRecords": session["totalRecords"],
            }

        ready_records = []
        for index in range(session["totalChunks"]):
            ready_records.extend(session["chunks"].get(index, []))
        ready_deletions = session.get("deletions", [])
        SYNC_SESSIONS.pop(sync_id, None)

    return save_full_sync_records(ready_records, chunk, ready_deletions)


def save_full_sync_records(records, chunk=None, deletions=None):
    reset_at = load_reset_at()
    incoming = []
    if not isinstance(records, list):
        records = []
    for record in records:
        normalized = normalize_mobile_record(record)
        if normalized and is_after_reset(normalized, reset_at):
            incoming.append(normalized)
    merged_deletions = merge_deletions(load_deletions(), deletions)
    deleted_ids = {item["id"] for item in merged_deletions}
    merged = [record for record in merge_records(load_existing_records(), incoming) if record.get("id") not in deleted_ids]
    if reset_at:
        merged = [record for record in merged if is_after_reset(record, reset_at)]
    saved_at = datetime.now().isoformat()
    months = sorted({record["date"][:7] for record in merged})

    full_payload = {
        "app": "手机记账",
        "schema": "mobile-ledger-sync",
        "savedAt": saved_at,
        "records": merged,
    }
    write_json(OUT_DIR / "手机记账-全部同步.json", full_payload)
    write_json(DELETIONS_FILE, {
        "app": "手机记账",
        "schema": "mobile-ledger-deletions",
        "savedAt": saved_at,
        "deletions": merged_deletions,
    })

    for month in months:
        month_records = [record for record in merged if record["date"].startswith(month)]
        finance_payload = {
            "app": "手机记账",
            "schema": "personal-asset-manager-compatible",
            "month": month,
            "exportedAt": saved_at,
            "transactions": [to_finance_transaction(record) for record in month_records],
            "records": month_records,
        }
        write_json(OUT_DIR / f"手机记账-{month}-导入财务管理.json", finance_payload)

    return {
        "ok": True,
        "totalRecords": len(merged),
        "acceptedRecords": len(incoming),
        "deletedRecords": len(merged_deletions),
        "chunk": chunk,
        "months": months,
        "outputDir": str(OUT_DIR),
    }


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def load_existing_records():
    file_path = OUT_DIR / "手机记账-全部同步.json"
    if not file_path.exists():
        return []
    try:
        data = json.loads(file_path.read_text("utf-8"))
        records = data.get("records", [])
        return [record for record in (normalize_mobile_record(item) for item in records) if record]
    except Exception:
        return []


def load_deletions():
    if not DELETIONS_FILE.exists():
        return []
    try:
        data = json.loads(DELETIONS_FILE.read_text("utf-8"))
        return normalize_deletions(data.get("deletions", []))
    except Exception:
        return []


def normalize_deletions(deletions):
    result = {}
    if not isinstance(deletions, list):
        return []
    for item in deletions:
        if isinstance(item, str):
            record_id, deleted_at = item.strip(), ""
        elif isinstance(item, dict):
            record_id = str(item.get("id") or "").strip()
            deleted_at = str(item.get("deletedAt") or "")
        else:
            continue
        if not record_id:
            continue
        current = result.get(record_id)
        if not current or deleted_at > current["deletedAt"]:
            result[record_id] = {"id": record_id, "deletedAt": deleted_at}
    return sorted(result.values(), key=lambda item: (item["deletedAt"], item["id"]))


def merge_deletions(existing, incoming):
    return normalize_deletions([*(existing or []), *((incoming or []) if isinstance(incoming, list) else [])])


def parse_amount(value):
    try:
        return float(str(value).replace(",", "").strip() or 0)
    except Exception:
        return 0


def normalize_mobile_record(record):
    if not isinstance(record, dict):
        return None
    date = str(record.get("date") or "").strip()
    amount = parse_amount(record.get("amount"))
    if not date or amount <= 0:
        return None
    normalized = dict(record)
    normalized["date"] = date
    normalized["amount"] = amount
    normalized["type"] = "income" if normalized.get("type") == "income" else "expense"
    normalized["category"] = str(normalized.get("category") or "其他")
    normalized["note"] = str(normalized.get("note") or "")
    normalized["createdAt"] = str(normalized.get("createdAt") or normalized.get("updatedAt") or "")
    normalized["updatedAt"] = str(normalized.get("updatedAt") or normalized.get("createdAt") or "")
    return normalized


def load_reset_at():
    if not RESET_FILE.exists():
        return ""
    try:
        data = json.loads(RESET_FILE.read_text("utf-8"))
        return data.get("resetAt") or ""
    except Exception:
        return ""


def is_after_reset(record, reset_at):
    if not reset_at:
        return True
    marker = record.get("updatedAt") or record.get("createdAt") or ""
    if not marker:
        return True
    return marker > reset_at


def reset_mobile_ledger():
    reset_at = datetime.now().isoformat()
    write_json(RESET_FILE, {
        "app": "手机记账",
        "schema": "mobile-ledger-reset",
        "resetAt": reset_at,
        "reason": "清空测试数据，从零开始",
    })
    write_json(OUT_DIR / "手机记账-全部同步.json", {
        "app": "手机记账",
        "schema": "mobile-ledger-sync",
        "savedAt": reset_at,
        "resetAt": reset_at,
        "records": [],
    })
    for file_path in OUT_DIR.glob("手机记账-*-导入财务管理.json"):
        try:
            file_path.unlink()
        except Exception:
            pass
    strip_mobile_ledger_from_migration()
    return {"ok": True, "resetAt": reset_at, "records": 0}


def save_codex_analysis(payload):
    period_mode = str(payload.get("periodMode") or "period").replace("/", "-")
    range_data = payload.get("range") if isinstance(payload.get("range"), dict) else {}
    start = str(range_data.get("start") or "unknown").replace("/", "-")
    end = str(range_data.get("end") or "unknown").replace("/", "-")
    saved_at = datetime.now().isoformat()
    output = {
        "ok": True,
        "app": "支出与收入流水",
        "schema": "codex-cashflow-analysis-workspace:v1",
        "savedAt": saved_at,
        "payload": payload,
    }
    file_name = f"{period_mode}-{start}_to_{end}.json"
    target = ANALYSIS_DIR / file_name
    latest = ANALYSIS_DIR / "latest-analysis.json"
    write_json(target, output)
    write_json(latest, output)
    return {
        "ok": True,
        "file": str(target),
        "latestFile": str(latest),
        "records": len(payload.get("transactions") or []),
        "periodMode": payload.get("periodMode"),
        "range": range_data,
    }


def save_codex_stock_analysis(payload):
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    saved_at = datetime.now().isoformat()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    count = len(payload.get("positions") or [])
    output = {
        "ok": True,
        "app": "洒一股票持仓",
        "schema": "codex-stock-portfolio-analysis-workspace:v1",
        "savedAt": saved_at,
        "payload": payload,
    }
    file_name = f"stock-portfolio-{stamp}-{count}positions.json"
    target = STOCK_ANALYSIS_DIR / file_name
    latest = STOCK_ANALYSIS_DIR / "latest-stock-analysis.json"
    write_json(target, output)
    write_json(latest, output)
    return {
        "ok": True,
        "file": str(target),
        "latestFile": str(latest),
        "positions": count,
        "totalAssetsCNY": summary.get("totalAssetsCNY"),
        "marketValueCNY": summary.get("marketValueCNY"),
    }


def strip_mobile_ledger_from_migration():
    if not MIGRATION_FILE.exists():
        return
    try:
        data = json.loads(MIGRATION_FILE.read_text("utf-8"))
        raw_data = data.get("rawData") if isinstance(data.get("rawData"), dict) else {}
        raw_data.pop("mobile-ledger:v1", None)
        data["rawData"] = raw_data
        data["mobileLedgerClearedAt"] = datetime.now().isoformat()
        write_json(MIGRATION_FILE, data)
    except Exception:
        pass


def merge_records(existing, incoming):
    records = {}
    for record in existing + incoming:
        if not isinstance(record, dict):
            continue
        key = record.get("id") or "|".join(str(record.get(part, "")) for part in ["date", "type", "amount", "category", "note"])
        record["id"] = key
        records[key] = record
    return sorted(records.values(), key=lambda item: (item.get("date", ""), item.get("createdAt", "")))


def latest_sync_saved_at():
    file_path = OUT_DIR / "手机记账-全部同步.json"
    if not file_path.exists():
        return ""
    try:
        data = json.loads(file_path.read_text("utf-8"))
        return data.get("savedAt") or ""
    except Exception:
        return ""


def to_finance_transaction(item):
    return {
        "date": item.get("date"),
        "type": "收入" if item.get("type") == "income" else "支出",
        "direction": "收入" if item.get("type") == "income" else "支出",
        "amount": parse_amount(item.get("amount")),
        "category": map_category_for_finance(item),
        "merchant": item.get("note") or item.get("category"),
        "note": item.get("note") or "",
        "source": "手机记账自动同步",
    }


def map_category_for_finance(item):
    category = item.get("category", "其他")
    if item.get("type") == "income":
        if category == "兼职收入":
            return "兼职"
        return category if category in ["工资", "奖金", "投资收益", "副业", "兼职", "退款"] else "其他收入"
    category_map = {
        "蔬菜": "餐饮",
        "水果": "餐饮",
        "零食": "餐饮",
        "日用": "购物",
        "服饰": "购物",
        "住房": "居住",
        "居家": "居住",
        "学习": "教育",
        "书籍": "教育",
        "长辈": "人情",
        "礼金": "人情",
        "礼物": "人情",
        "亲友": "人情",
    }
    return category_map.get(category) or (category if category in ["餐饮", "交通", "购物", "娱乐", "医疗", "旅行"] else "其他")


def write_json(file_path, data):
    file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def load_voice_test_sync():
    if not VOICE_TEST_SYNC_FILE.exists():
        return {"ok": True, "app": "手机语音记账测试版", "records": [], "savedAt": ""}
    try:
        payload = json.loads(VOICE_TEST_SYNC_FILE.read_text("utf-8"))
        return {"ok": True, **payload}
    except Exception as error:
        return {"ok": False, "records": [], "error": str(error)}


def save_voice_test_sync(payload):
    records = payload.get("records", []) if isinstance(payload.get("records"), list) else []
    clean_records = [record for record in records if isinstance(record, dict)]
    saved_at = str(payload.get("syncedAt") or datetime.now().isoformat(timespec="seconds"))
    data = {
        "app": "手机语音记账测试版",
        "schema": "mobile-voice-ledger-test-sync-v1",
        "savedAt": saved_at,
        "records": clean_records,
    }
    write_json(VOICE_TEST_SYNC_FILE, data)
    return {"ok": True, "saved": len(clean_records), "totalRecords": len(clean_records), "savedAt": saved_at}


def load_migration_payload():
    if not MIGRATION_FILE.exists():
        return {"ok": True, "saved": False, "sources": []}
    try:
        data = json.loads(MIGRATION_FILE.read_text("utf-8"))
        return {"ok": True, "saved": True, **data}
    except Exception as error:
        return {"ok": False, "saved": False, "error": str(error)}


def save_migration_payload(payload):
    existing = load_migration_payload() if MIGRATION_FILE.exists() else {"sources": [], "rawData": {}}
    raw_data = existing.get("rawData", {}) if isinstance(existing.get("rawData"), dict) else {}
    incoming_raw = payload.get("rawData", {}) if isinstance(payload.get("rawData"), dict) else {}
    for key, value in incoming_raw.items():
        if value not in [None, "", "null", "undefined"]:
            raw_data[key] = value

    source = payload.get("source") or "unknown"
    sources = [item for item in existing.get("sources", []) if item != source]
    sources.append(source)
    saved_at = datetime.now().isoformat()
    merged_payload = {
        "savedAt": saved_at,
        "sources": sources,
        "rawData": raw_data,
    }
    write_json(MIGRATION_FILE, merged_payload)

    mobile_raw = raw_data.get("mobile-ledger:v1")
    mobile_records = parse_records_from_raw(mobile_raw)
    if mobile_records:
        save_sync_payload({"records": mobile_records})

    return {
        "ok": True,
        "savedAt": saved_at,
        "sources": sources,
        "keys": sorted(raw_data.keys()),
        "mobileRecords": len(mobile_records),
        "outputFile": str(MIGRATION_FILE),
    }


def parse_records_from_raw(raw):
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, dict) and isinstance(data.get("records"), list):
        return data["records"]
    if isinstance(data, dict) and isinstance(data.get("transactions"), list):
        return data["transactions"]
    return []


def local_ips():
    ips = set()
    for interface in ("en0", "en1"):
        try:
            result = subprocess.run(
                ["ipconfig", "getifaddr", interface],
                check=False,
                capture_output=True,
                text=True,
            )
            ip = result.stdout.strip()
            if ip and not ip.startswith("127."):
                ips.add(ip)
        except Exception:
            pass
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        if not ip.startswith("10."):
            ips.add(ip)
        sock.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and not ip.startswith("10."):
                ips.add(ip)
    except Exception:
        pass
    return sorted(ips)


def local_hostnames():
    names = set()
    try:
        hostname = socket.gethostname().strip().rstrip(".")
        if hostname and hostname != "localhost":
            names.add(hostname if hostname.endswith(".local") else f"{hostname}.local")
    except Exception:
        pass
    try:
        result = subprocess.run(
            ["scutil", "--get", "LocalHostName"],
            check=False,
            capture_output=True,
            text=True,
        )
        local_name = result.stdout.strip().rstrip(".")
        if local_name:
            names.add(f"{local_name}.local")
    except Exception:
        pass
    return sorted(names)


def local_urls(port):
    host_urls = [f"https://{name}:{port}/" for name in local_hostnames()]
    ip_urls = [f"https://{ip}:{port}/" for ip in local_ips()]
    return host_urls + ip_urls


def cert_urls(port):
    return [f"http://{ip}:{port}/mobile-ledger-local-ca.pem" for ip in local_ips()]


def get_pairing_token():
    global _PAIRING_TOKEN
    with _PAIRING_TOKEN_LOCK:
        if _PAIRING_TOKEN is not None:
            return _PAIRING_TOKEN
        nofollow = getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(PAIRING_TOKEN_FILE, os.O_RDONLY | nofollow)
        except FileNotFoundError:
            token = secrets.token_urlsafe(32)
            try:
                fd = os.open(PAIRING_TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL | nofollow, 0o600)
            except FileExistsError:
                fd = os.open(PAIRING_TOKEN_FILE, os.O_RDONLY | nofollow)
            else:
                try:
                    os.fchmod(fd, 0o600)
                    if os.write(fd, token.encode("ascii")) != len(token):
                        raise OSError("配对令牌未完整保存")
                    os.fsync(fd)
                finally:
                    os.close(fd)
                _PAIRING_TOKEN = token
                return token
        try:
            metadata = os.fstat(fd)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
                raise OSError("配对令牌文件的归属不安全")
            if stat.S_IMODE(metadata.st_mode) != 0o600:
                os.fchmod(fd, 0o600)
            token = os.read(fd, 128).decode("ascii")
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
                raise ValueError("配对令牌文件内容无效")
            _PAIRING_TOKEN = token
            return token
        finally:
            os.close(fd)


def run_openssl(args):
    subprocess.run(["openssl", *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ensure_ca_cert():
    if CA_KEY.exists() and CA_CERT.exists():
        return
    run_openssl([
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "3650",
        "-nodes",
        "-keyout",
        str(CA_KEY),
        "-out",
        str(CA_CERT),
        "-subj",
        "/CN=手机记账本地根证书",
    ])


def ensure_https_cert():
    ensure_ca_cert()
    os.chmod(CA_KEY, 0o600)
    ips = local_ips() or ["127.0.0.1"]
    hostnames = local_hostnames()
    alt_names = ["DNS:localhost", *[f"DNS:{name}" for name in hostnames], "IP:127.0.0.1", *[f"IP:{ip}" for ip in ips]]
    for path in (SERVER_KEY, SERVER_CSR, SERVER_CERT):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as config:
        config.write(
            "\n".join([
                "[req]",
                "prompt = no",
                "distinguished_name = dn",
                "req_extensions = req_ext",
                "[dn]",
                "CN = 手机记账本地HTTPS",
                "[req_ext]",
                "subjectAltName = " + ", ".join(alt_names),
                "[server_ext]",
                "basicConstraints = CA:FALSE",
                "keyUsage = digitalSignature, keyEncipherment",
                "extendedKeyUsage = serverAuth",
                "subjectAltName = " + ", ".join(alt_names),
                "",
            ])
        )
        config_path = config.name
    try:
        run_openssl([
            "req",
            "-new",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(SERVER_KEY),
            "-out",
            str(SERVER_CSR),
            "-config",
            config_path,
        ])
        os.chmod(SERVER_KEY, 0o600)
        run_openssl([
            "x509",
            "-req",
            "-in",
            str(SERVER_CSR),
            "-CA",
            str(CA_CERT),
            "-CAkey",
            str(CA_KEY),
            "-CAcreateserial",
            "-out",
            str(SERVER_CERT),
            "-days",
            "397",
            "-sha256",
            "-extensions",
            "server_ext",
            "-extfile",
            config_path,
        ])
    finally:
        try:
            Path(config_path).unlink()
        except Exception:
            pass


def start_server():
    try:
        ensure_https_cert()
        pairing_token = get_pairing_token()
    except Exception as error:
        print("启动失败：无法准备 HTTPS 证书或手机配对令牌。")
        print("请确认 Mac 上可以运行 openssl，且证书目录可写。")
        print(f"错误：{error}")
        sys.stdout.flush()
        sys.exit(1)

    cert_server = None
    try:
        cert_server = ReusableThreadingHTTPServer((BIND_HOST, CERT_PORT), CertHandler)
    except OSError as error:
        print(f"证书下载端口 {CERT_PORT} 未能启动：{error}")

    try:
        server = ReusableThreadingHTTPServer((BIND_HOST, FIXED_PORT), Handler)
    except OSError as error:
        if cert_server:
            cert_server.server_close()
        print(f"启动失败：固定端口 {FIXED_PORT} 未能启动：{error}")
        print("请检查端口是否被占用或访问是否受限，再决定是否重新启动。")
        print(f"固定手机地址仍然会是：https://你的电脑Wi-Fi地址:{FIXED_PORT}/")
        sys.stdout.flush()
        sys.exit(1)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(SERVER_CERT), keyfile=str(SERVER_KEY))
    server.socket = context.wrap_socket(server.socket, server_side=True)
    if cert_server:
        threading.Thread(target=cert_server.serve_forever, daemon=True).start()

    print("手机记账 HTTPS 同步接收器已启动")
    print(f"电脑打开: https://localhost:{FIXED_PORT}/")
    if cert_server:
        print(f"电脑查看手机记账: http://localhost:{CERT_PORT}/voice-ledger-stable/index.html")
        print(f"电脑查看财务管理: http://localhost:{CERT_PORT}/财务管理/index.html")
        print(f"电脑查看流水分析: http://localhost:{CERT_PORT}/支出与收入流水/index.html")
    if cert_server:
        for url in cert_urls(CERT_PORT):
            print(f"手机安装证书: {url}")
    else:
        print(f"证书下载端口 {CERT_PORT} 被占用。可以从 Mac 手动发送这个证书给 iPhone：{CA_CERT}")
    if BIND_HOST in {"127.0.0.1", "localhost", "::1"}:
        print("当前仅监听本机；手机不能通过局域网访问。")
    else:
        urls = local_urls(FIXED_PORT)
        if not urls:
            print("没有自动识别到手机地址。请确认电脑已连接 Wi-Fi。")
        for url in urls:
            print(f"手机首次配对并打开正式版: {url}pair?token={pairing_token}")
    print(f"固定端口: {FIXED_PORT}")
    print(f"证书下载端口: {CERT_PORT}")
    print(f"同步文件保存到: {OUT_DIR}")
    print(f"手机证书文件: {CA_CERT}")
    print()
    print("第一次使用 HTTPS：请先把上面的“手机记账本地根证书”安装到 iPhone，并在 设置 > 通用 > 关于本机 > 证书信任设置 里完全信任。")
    print("窗口不要关闭。关闭窗口后，手机就不能同步到电脑。")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("手机记账接收器已停止。")
    finally:
        server.server_close()
        if cert_server:
            cert_server.shutdown()
            cert_server.server_close()


if __name__ == "__main__":
    start_server()
