"""Read gateway contracts tested with synthetic responses, never a live account."""
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
import http.client
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace as NS
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import quote

from tools import longbridge_gateway as gateway


class AdapterTests(unittest.TestCase):
    def backend(self, contexts, allow_positions=False):
        backend = gateway.LongbridgeReads(allow_positions=allow_positions, env={})
        backend._sdk = lambda: NS(CalendarCategory=NS(Ipo="Ipo"))
        backend._context = lambda name, _sdk: contexts[name]
        return backend

    def test_decimal_precision_and_timezone_are_preserved(self):
        value = NS(price=Decimal("123456789.0123456789"),
                   timestamp=datetime(2026, 1, 2, 3, 4, tzinfo=timezone.utc),
                   unexpected_secret="synthetic-secret")
        result = gateway.record(value, ("price", "timestamp", "missing"))
        self.assertEqual(result["price"], "123456789.0123456789")
        self.assertEqual(result["timestamp"], "2026-01-02T03:04:00+00:00")
        self.assertIsNone(result["missing"])
        self.assertNotIn("unexpected_secret", result)

    def test_enum_serialization_and_nonfinite_values(self):
        class Market(Enum):
            HK = 1
        self.assertEqual(gateway.json_value(Market.HK), "HK")
        self.assertIsNone(gateway.json_value(float("nan")))
        self.assertIsNone(gateway.json_value(Decimal("Infinity")))
        with self.assertRaises(TypeError):
            gateway.json_value(NS(secret="synthetic-secret"))

    def test_native_pyo3_sdk_enums_in_builtins_module_are_serialized(self):
        native_type = type("TradeStatus", (), {
            "__module__": "builtins", "__str__": lambda _self: "TradeStatus.Normal"
        })
        self.assertEqual(gateway.json_value(native_type()), "Normal")

    def test_installed_official_sdk_enum_compatibility_without_account_access(self):
        try:
            from longport import openapi as sdk
        except ImportError:
            self.skipTest("Optional SDK not installed; native shape tested separately")
        for value,expected in ((sdk.Market.HK,"HK"),(sdk.TradeStatus.Normal,"Normal"),
                               (sdk.OptionDirection.Call,"Call"),(sdk.OptionType.American,"American")):
            with self.subTest(enum=type(value).__name__):
                self.assertEqual(gateway.json_value(value),expected)

    def test_quote_preserves_metadata_missing_symbols_and_upstream_timestamp(self):
        ctx = MagicMock()
        ctx.static_info.return_value = [NS(symbol="TEST.HK", currency="HKD",
                                          exchange="SYNTHETIC", name_cn="模拟证券")]
        ctx.quote.return_value = [NS(symbol="TEST.HK", last_done=Decimal("10.0100"),
                                    timestamp=datetime(2026, 1, 2, tzinfo=timezone.utc))]
        result = self.backend({"QuoteContext":ctx}).quotes(["TEST.HK", "MISSING.US"])
        self.assertEqual(result["missing_symbols"], ["MISSING.US"])
        row = result["quotes"][0]
        self.assertEqual(row["currency"], "HKD")
        self.assertEqual(row["last_done"], "10.0100")
        self.assertIsNone(row["prev_close"])
        ctx.quote.assert_called_once_with(["TEST.HK", "MISSING.US"])
        ctx.option_quote.assert_not_called()

    def test_option_routes_to_option_quote_with_contract_fields(self):
        ctx = MagicMock()
        ctx.static_info.return_value = []
        ctx.option_quote.return_value = [NS(symbol="TEST261231C10000.US",
                                            contract_multiplier=Decimal("100"))]
        result = self.backend({"QuoteContext":ctx}).quotes(["TEST261231C10000.US"], options=True)
        self.assertEqual(result["quotes"][0]["contract_multiplier"], "100")
        self.assertIsNone(result["quotes"][0]["currency"])
        ctx.quote.assert_not_called()

    def test_exchange_rate_direction_matches_official_sdk_definition(self):
        ctx = MagicMock()
        ctx.exchange_rate.return_value = NS(exchanges=[NS(
            base_currency="AAA", other_currency="BBB", average_rate=2.0,
            bid_rate=1.9, offer_rate=2.1)])
        result = self.backend({"PortfolioContext":ctx}).exchange_rates()
        row = result["rates"][0]
        self.assertEqual((row["from_currency"], row["to_currency"], row["rate"]), ("BBB", "AAA", 2.0))
        self.assertIsNone(result["as_of"])
        self.assertEqual(len(result["rates"]), 1)

    def test_positions_disabled_before_sdk_or_account_access(self):
        backend = gateway.LongbridgeReads(env={})
        with patch.object(backend, "_sdk") as sdk:
            with self.assertRaises(gateway.GatewayError) as caught:
                backend.positions()
            self.assertEqual(caught.exception.code, "positions_disabled")
            sdk.assert_not_called()

    def test_positions_serialize_allowlisted_fields_and_omit_account_channel(self):
        ctx = MagicMock()
        ctx.stock_positions.return_value = NS(channels=[NS(account_channel="private-channel",
            positions=[NS(symbol="TEST.HK", quantity=Decimal("2"), currency="HKD")])])
        result = self.backend({"TradeContext":ctx}, allow_positions=True).positions()
        self.assertEqual(result["positions"][0]["quantity"], "2")
        self.assertNotIn("private-channel", json.dumps(result))
        ctx.stock_positions.assert_called_once_with(None)
        ctx.submit_order.assert_not_called()

    def test_ipo_calendar_hk_filter_and_pagination_are_preserved(self):
        ctx = MagicMock()
        ctx.finance_calendar.return_value = NS(next_date="2026-01-10",list=[NS(
            date="2026-01-02",count=1,infos=[NS(symbol="TEST.HK",content="模拟日历事件",
                data_kv=[NS(key="label",value="demo",value_type="synthetic",value_raw="0")])])])
        result = self.backend({"CalendarContext":ctx}).ipo_calendar("2026-01-01", "2026-01-15")
        ctx.finance_calendar.assert_called_once_with("Ipo", "2026-01-01", "2026-01-15", "HK")
        self.assertEqual(result["next_date"], "2026-01-10")
        self.assertEqual(result["groups"][0]["events"][0]["content"], "模拟日历事件")

    def test_credentials_are_environment_only_without_endpoint_override(self):
        backend = gateway.LongbridgeReads(env={name:"synthetic-value" for name in gateway.CREDENTIAL_NAMES})
        sdk = NS(Config=NS(from_apikey=MagicMock(return_value="configuration")),
                 Language=NS(ZH_CN="zh-CN"), QuoteContext=MagicMock(return_value="quote-context"))
        self.assertEqual(backend._context("QuoteContext", sdk), "quote-context")
        self.assertEqual(backend._context("QuoteContext", sdk), "quote-context")
        kwargs = sdk.Config.from_apikey.call_args.kwargs
        self.assertEqual(kwargs["http_url"], "https://openapi.longportapp.com")
        self.assertIsNone(kwargs["log_path"])
        self.assertFalse(kwargs["enable_print_quote_packages"])
        sdk.QuoteContext.assert_called_once()

    def test_missing_credentials_do_not_import_sdk(self):
        with patch.object(gateway.importlib, "import_module") as import_sdk:
            with self.assertRaises(gateway.GatewayError) as caught:
                gateway.LongbridgeReads(env={})._sdk()
            self.assertEqual(caught.exception.code, "not_configured")
            import_sdk.assert_not_called()

    def test_sdk_logging_is_refused(self):
        env = {name:"synthetic-value" for name in gateway.CREDENTIAL_NAMES}
        env["LONGPORT_LOG_PATH"] = "synthetic-log-path"
        with self.assertRaises(gateway.GatewayError) as caught:
            gateway.LongbridgeReads(env=env)._sdk()
        self.assertEqual(caught.exception.code, "sdk_logging_disabled")

    def test_symbol_validation_rejects_ambiguous_invalid_or_excessive_inputs(self):
        for value in ("TEST", "TEST.US,,TEST.HK", "../../.US", ",".join(["TEST.US"]*21)):
            with self.subTest(value=value), self.assertRaises(gateway.GatewayError):
                gateway.symbols_from({"symbols":[value]})
        self.assertEqual(gateway.symbols_from({"symbols":[" test.hk , TEST.HK"]}), ["TEST.HK"])

    def test_ipo_date_validation_enforces_valid_small_window(self):
        for start,end in (("2026-02-30","2026-03-01"),("2026-02-01","2026-01-01"),
                          ("2026-01-01","2026-03-01"),("2026-1-1","2026-01-03")):
            with self.subTest(start=start), self.assertRaises(gateway.GatewayError):
                gateway.dates_from({"start":[start],"end":[end]})


class FakeBackend:
    def __init__(self):
        self.calls = []
        self.fail = False

    def status(self):
        self.calls.append("status")
        return {"configured":False,"connection_checked":False}

    def quotes(self, symbols, options=False):
        self.calls.append(("quotes",symbols,options))
        if self.fail:
            raise RuntimeError("synthetic-token-must-not-leak")
        return {"quotes":[],"missing_symbols":symbols}

    def positions(self, _symbols=None):
        raise gateway.GatewayError(403,"positions_disabled","未启用")

    def exchange_rates(self):
        self.calls.append("exchange-rates")
        return {"rates":[],"as_of":None}

    def ipo_calendar(self,start,end):
        self.calls.append(("ipo-calendar",start,end))
        return {"groups":[],"next_date":""}


class HTTPContractTests(unittest.TestCase):
    """One ephemeral loopback server; bounded lifetime and explicit cleanup."""
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="finance-gateway-test-")
        cls.root = Path(cls.directory.name)
        (cls.root/"洒一投资工具箱").mkdir()
        (cls.root/"洒一投资工具箱/长桥数据.html").write_text("<h1>synthetic panel</h1>")
        (cls.root/".env").write_text("SYNTHETIC_PRIVATE=must-not-be-served")
        cls.backend = FakeBackend()
        cls.server = gateway.GatewayServer(("127.0.0.1",0),cls.root,cls.backend)
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.timer = threading.Timer(30,cls.server.shutdown)
        cls.timer.daemon = True
        cls.timer.start()

    @classmethod
    def tearDownClass(cls):
        cls.timer.cancel()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.timer.join(timeout=2)
        if cls.thread.is_alive():
            raise AssertionError("Test server did not stop")
        cls.directory.cleanup()

    def setUp(self):
        self.backend.calls.clear()
        self.backend.fail = False

    def request(self,path,method="GET",headers=None,decode=True):
        conn = http.client.HTTPConnection("127.0.0.1",self.server.server_port,timeout=3)
        try:
            conn.request(method,quote(path,safe="/?=&,%"),headers=headers or {})
            response = conn.getresponse()
            body = response.read()
            return response.status,dict(response.getheaders()),json.loads(body) if decode and body else body
        finally:
            conn.close()

    def test_status_does_not_check_upstream_connection(self):
        status,headers,payload = self.request("/api/longbridge/status")
        self.assertEqual(status,200)
        self.assertEqual(headers["Cache-Control"],"no-store")
        self.assertNotIn("Access-Control-Allow-Origin",headers)
        self.assertFalse(payload["data"]["connection_checked"])

    def test_required_header_prevents_cross_site_simple_read(self):
        status,_,payload = self.request("/api/longbridge/quotes?symbols=TEST.US")
        self.assertEqual(status,403)
        self.assertEqual(payload["error"]["code"],"request_header_required")
        self.assertEqual(self.backend.calls,[])

    def test_cross_origin_and_dns_rebinding_host_are_denied(self):
        for headers in ({"Origin":"https://untrusted.invalid","X-Finance-Request":"1"},
                        {"Host":"untrusted.invalid","X-Finance-Request":"1"},
                        {"Sec-Fetch-Site":"cross-site","X-Finance-Request":"1"}):
            with self.subTest(headers=headers):
                status,_,_ = self.request("/api/longbridge/exchange-rates",headers=headers)
                self.assertEqual(status,403)
        self.assertEqual(self.backend.calls,[])

    def test_read_contract_and_option_dispatch(self):
        status,_,payload = self.request("/api/longbridge/option-quotes?symbols=test.us",
                                       headers={"X-Finance-Request":"1"})
        self.assertEqual(status,200)
        self.assertEqual(payload["source"],gateway.SOURCE)
        self.assertIn("queried_at",payload)
        self.assertEqual(self.backend.calls,[("quotes",["TEST.US"],True)])

    def test_errors_never_return_sdk_exception_credentials(self):
        self.backend.fail = True
        status,_,payload = self.request("/api/longbridge/quotes?symbols=TEST.US",
                                       headers={"X-Finance-Request":"1"})
        self.assertEqual(status,502)
        self.assertNotIn("synthetic-token",json.dumps(payload))

    def test_post_put_delete_and_preflight_are_rejected(self):
        for method in ("POST","PUT","PATCH","DELETE","OPTIONS"):
            with self.subTest(method=method):
                status,_,payload = self.request("/api/longbridge/positions",method)
                self.assertEqual(status,405)
                self.assertEqual(payload["error"]["code"],"read_only")
        self.assertEqual(self.backend.calls,[])

    def test_secret_source_runtime_and_traversal_paths_are_not_served(self):
        for path in ("/.env","/tools/longbridge_gateway.py","/runtime/data.json",
                     "/洒一投资工具箱/../.env","/洒一投资工具箱/%2e%2e/.env","/品牌资产/unknown.png"):
            with self.subTest(path=path):
                status,_,payload = self.request(path)
                self.assertEqual(status,404)
                self.assertNotIn("must-not-be-served",json.dumps(payload))

    def test_symlink_escape_from_allowlist_is_denied(self):
        with tempfile.TemporaryDirectory(prefix="finance-outside-test-") as outside:
            private = Path(outside)/"private.txt"
            private.write_text("synthetic-private")
            link = self.root/"icon.svg"
            link.symlink_to(private)
            try:
                status,_,_ = self.request("/icon.svg")
                self.assertEqual(status,404)
            finally:
                link.unlink()

    def test_allowlisted_symlink_cannot_alias_runtime_data_inside_root(self):
        (self.root/"runtime").mkdir(exist_ok=True)
        private = self.root/"runtime/private.txt"
        private.write_text("synthetic-private")
        link = self.root/"icon.svg"
        link.symlink_to(private)
        try:
            status,_,_ = self.request("/icon.svg")
            self.assertEqual(status,404)
        finally:
            link.unlink()

    def test_panel_is_served_and_alias_preserves_relative_links(self):
        status,_,body = self.request("/洒一投资工具箱/长桥数据.html",decode=False)
        self.assertEqual(status,200)
        self.assertIn(b"synthetic panel",body)
        status,headers,_ = self.request("/长桥数据.html",decode=False)
        self.assertEqual(status,302)
        self.assertEqual(headers["Location"],quote("/洒一投资工具箱/长桥数据.html"))

    def test_home_link_returns_to_separately_started_receiver(self):
        status,headers,_ = self.request("/index.html",decode=False)
        self.assertEqual(status,302)
        self.assertEqual(headers["Location"],"http://127.0.0.1:4176/")

    def test_unknown_parameters_and_mutation_routes_are_rejected(self):
        for path,expected in (("/api/longbridge/quotes?symbols=TEST.US&token=demo",400),
                              ("/api/longbridge/submit-order",404),
                              ("/api/longbridge/quotes?symbols=TEST.US&symbols=OTHER.US",400)):
            with self.subTest(path=path):
                status,_,_ = self.request(path,headers={"X-Finance-Request":"1"})
                self.assertEqual(status,expected)
        self.assertEqual(self.backend.calls,[])

    def test_unavailable_offers_differ_from_no_real_world_offers(self):
        status,_,payload = self.request("/api/longbridge/offers",headers={"X-Finance-Request":"1"})
        self.assertEqual(status,501)
        self.assertEqual(payload["error"]["code"],"offers_unavailable")


if __name__ == "__main__":
    unittest.main()
