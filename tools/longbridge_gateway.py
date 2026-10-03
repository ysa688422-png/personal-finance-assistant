#!/usr/bin/env python3
"""Foreground, loopback-only read adapter for the official Longbridge SDK.

Only whitelisted reads and selected published static files are exposed. No account
data is cached on disk, no credentials are sent to the browser, and no order or
other account mutation is implemented. See docs/longbridge.md for the contract.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib
import importlib.metadata
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import signal
import time
from urllib.parse import parse_qs, quote, unquote, urlsplit


SOURCE = "Longbridge OpenAPI"
SDK_VERSION = "4.3.7"
CREDENTIAL_NAMES = ("LONGPORT_APP_KEY", "LONGPORT_APP_SECRET", "LONGPORT_ACCESS_TOKEN")
SDK_ENUM_NAMES = frozenset({"Market", "TradeStatus", "OptionDirection", "OptionType"})
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,61}\.(US|HK|SH|SZ|SG)$")
QUOTE_FIELDS = ("symbol", "last_done", "prev_close", "open", "high", "low", "timestamp",
                "volume", "turnover", "trade_status")
OPTION_FIELDS = QUOTE_FIELDS + (
    "implied_volatility", "open_interest", "expiry_date", "strike_price",
    "contract_multiplier", "contract_type", "contract_size", "direction",
    "historical_volatility", "underlying_symbol",
)
POSITION_FIELDS = ("symbol", "symbol_name", "quantity", "available_quantity",
                   "currency", "cost_price", "market", "init_quantity")
EVENT_FIELDS = ("symbol", "market", "content", "counter_name", "date_type", "date",
                "event_type", "datetime", "currency", "financial_market_time")
STATIC_FILES = frozenset({
    "洒一投资工具箱/长桥数据.html", "洒一投资工具箱/longbridge-panel.js",
    "洒一投资工具箱/index.html", "洒一投资工具箱/股票持仓.html",
    "洒一投资工具箱/日内期权交易记录.html", "洒一投资工具箱/洒一开户奖励.html",
    "洒一投资工具箱/洒一港股打新.html", "洒一投资工具箱/港股打新阅读库.html",
    "洒一投资工具箱/manifest.json", "洒一投资工具箱/auto-backup.js",
    "site-auto-backup.js", "music-player.css", "music-player.js", "sayi-anime-theme.css",
    "icon.svg", "洒一投资工具箱/longbridge-rates.js",
    '品牌资产/sayi-finance-app-icon.png',
    '品牌资产/角色动图/星澄/gemini-highlight.gif',
    '品牌资产/角色动图/星澄/idle.gif',
    '品牌资产/角色动图/星澄/jumping.gif',
    '品牌资产/角色动图/星澄/review.gif',
    '品牌资产/角色动图/星澄/running.gif',
    '品牌资产/角色动图/星澄/star-expression.gif',
    '品牌资产/角色动图/星澄/star-pose.gif',
    '品牌资产/角色动图/星澄/star-tablet.gif',
    '品牌资产/角色动图/星澄/waving.gif',
    '品牌资产/角色动图/桃绘/idle.gif',
    '品牌资产/角色动图/桃绘/jumping.gif',
    '品牌资产/角色动图/桃绘/review.gif',
    '品牌资产/角色动图/桃绘/running.gif',
    '品牌资产/角色动图/桃绘/taohui-duty.gif',
    '品牌资产/角色动图/桃绘/taohui-receipt.gif',
    '品牌资产/角色动图/桃绘/waving.gif',
    '品牌资产/角色动图/樱露/idle.gif',
    '品牌资产/角色动图/樱露/jumping.gif',
    '品牌资产/角色动图/樱露/review.gif',
    '品牌资产/角色动图/樱露/running.gif',
    '品牌资产/角色动图/樱露/waving.gif',
    '品牌资产/角色动图/紫铃/idle.gif',
    '品牌资产/角色动图/紫铃/jumping.gif',
    '品牌资产/角色动图/紫铃/review.gif',
    '品牌资产/角色动图/紫铃/running.gif',
    '品牌资产/角色动图/紫铃/waving.gif',
    '品牌资产/角色动图/金璃/idle.gif',
    '品牌资产/角色动图/金璃/jumping.gif',
    '品牌资产/角色动图/金璃/review.gif',
    '品牌资产/角色动图/金璃/running.gif',
    '品牌资产/角色动图/金璃/waving.gif',
    '品牌资产/角色立绘/星澄.png',
    '品牌资产/角色立绘/桃绘.png',
    '品牌资产/角色立绘/樱露.png',
    '品牌资产/角色立绘/紫铃.png',
    '品牌资产/角色贴图/樱露/01-静候.png',
    '品牌资产/角色贴图/樱露/02-向右跑.png',
    '品牌资产/角色贴图/樱露/03-向左跑.png',
    '品牌资产/角色贴图/樱露/04-挥手.png',
    '品牌资产/角色贴图/樱露/05-跳跃.png',
    '品牌资产/角色贴图/樱露/06-委屈.png',
    '品牌资产/角色贴图/樱露/07-等待.png',
    '品牌资产/角色贴图/樱露/08-工作中.png',
    '品牌资产/角色贴图/樱露/09-复盘.png',
    '品牌资产/角色贴图/樱露/10-抬头看.png',
    '品牌资产/角色贴图/樱露/11-回头看.png',
    '品牌资产/角色贴图/紫铃/01-静候.png',
    '品牌资产/角色贴图/紫铃/02-向右跑.png',
    '品牌资产/角色贴图/紫铃/03-向左跑.png',
    '品牌资产/角色贴图/紫铃/04-挥手.png',
    '品牌资产/角色贴图/紫铃/05-跳跃.png',
    '品牌资产/角色贴图/紫铃/06-委屈.png',
    '品牌资产/角色贴图/紫铃/07-等待.png',
    '品牌资产/角色贴图/紫铃/08-工作中.png',
    '品牌资产/角色贴图/紫铃/09-复盘.png',
    '品牌资产/角色贴图/紫铃/10-抬头看.png',
    '品牌资产/角色贴图/紫铃/11-回头看.png',
})


class GatewayError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def json_value(value):
    """Preserve decimal precision and SDK timestamps; never dump arbitrary objects."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Decimal):
        return str(value) if value.is_finite() else None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.name
    # The actual 4.3.7 PyO3 enums have module 'builtins', not 'longport'.
    # Limit this conversion to the enum classes present in our response schemas.
    if type(value).__name__ in SDK_ENUM_NAMES and type(value).__module__ in (
        "builtins", "longport.openapi"
    ):
        rendered = str(value)
        prefix = type(value).__name__ + "."
        if rendered.startswith(prefix):
            return rendered[len(prefix):]
    raise TypeError("Unsupported upstream field type")


def record(value, fields):
    return {key: json_value(getattr(value, key, None)) for key in fields}


def symbols_from(params, required=True):
    raw = params.get("symbols", [""])
    if len(raw) != 1:
        raise GatewayError(400, "invalid_symbols", "symbols 只能提供一次。")
    if not raw[0] and not required:
        return None
    symbols = [symbol.strip().upper() for symbol in raw[0].split(",")]
    if not 1 <= len(symbols) <= 20 or any(
        not SYMBOL_PATTERN.fullmatch(symbol) or len(symbol) > 64 for symbol in symbols
    ):
        raise GatewayError(400, "invalid_symbols", "请输入 1–20 个带市场后缀的证券代码。")
    return list(dict.fromkeys(symbols))


def dates_from(params):
    values = []
    for key in ("start", "end"):
        raw = params.get(key, [])
        if len(raw) != 1 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw[0]):
            raise GatewayError(400, "invalid_dates", "start/end 需为 YYYY-MM-DD。")
        try:
            values.append(date.fromisoformat(raw[0]))
        except ValueError:
            raise GatewayError(400, "invalid_dates", "日期无效。") from None
    if not 0 <= (values[1] - values[0]).days <= 31:
        raise GatewayError(400, "invalid_dates", "日期区间需为顺序且不超过 31 天。")
    return tuple(value.isoformat() for value in values)


class LongbridgeReads:
    def __init__(self, allow_positions=False, env=None):
        self.allow_positions = allow_positions
        self.env = os.environ if env is None else env
        self._config = None
        self._contexts = {}

    def status(self):
        try:
            installed = importlib.metadata.version("longport")
        except importlib.metadata.PackageNotFoundError:
            installed = None
        return {
            "configured": all(bool(self.env.get(key)) for key in CREDENTIAL_NAMES),
            "sdk_version": installed, "required_sdk_version": SDK_VERSION,
            "connection_checked": False, "positions_enabled": self.allow_positions,
            "capabilities": ["quotes", "option_quotes", "exchange_rates", "ipo_calendar"],
            "unavailable": {
                "offers": "未接入开户、拉新或返佣活动数据。请在奖励模块手工录入并标注依据。",
                "ipo_subscription": "只接入 IPO 日历，未接入申购、配售或中签结果。",
            },
        }

    def _sdk(self):
        if not all(self.env.get(key) for key in CREDENTIAL_NAMES):
            raise GatewayError(503, "not_configured", "长桥凭证未配置，请在本机终端设置环境变量。")
        if self.env.get("LONGPORT_LOG_PATH") or os.environ.get("LONGPORT_LOG_PATH"):
            raise GatewayError(503, "sdk_logging_disabled", "请移除 LONGPORT_LOG_PATH，避免持仓响应写入日志。")
        try:
            if importlib.metadata.version("longport") != SDK_VERSION:
                raise GatewayError(503, "sdk_version_mismatch", "请安装 requirements-longbridge.txt 指定的 SDK。")
            return importlib.import_module("longport.openapi")
        except (ImportError, importlib.metadata.PackageNotFoundError):
            raise GatewayError(503, "sdk_missing", "请先安装 requirements-longbridge.txt。") from None

    def _context(self, name, sdk):
        if self._config is None:
            # Explicit parameters avoid dotenv loading, endpoint overrides and SDK logging.
            self._config = sdk.Config.from_apikey(
                self.env["LONGPORT_APP_KEY"], self.env["LONGPORT_APP_SECRET"],
                self.env["LONGPORT_ACCESS_TOKEN"],
                http_url="https://openapi.longportapp.com",
                quote_ws_url="wss://openapi-quote.longportapp.com/v2",
                trade_ws_url="wss://openapi-trade.longportapp.com/v2",
                language=sdk.Language.ZH_CN, enable_overnight=False,
                enable_print_quote_packages=False, log_path=None,
            )
        if name not in self._contexts:
            self._contexts[name] = getattr(sdk, name)(self._config)
        return self._contexts[name]

    def quotes(self, symbols, options=False):
        sdk = self._sdk()
        ctx = self._context("QuoteContext", sdk)
        infos = {info.symbol: info for info in ctx.static_info(symbols)}
        quotes = ctx.option_quote(symbols) if options else ctx.quote(symbols)
        rows = []
        for quote in quotes:
            row = record(quote, OPTION_FIELDS if options else QUOTE_FIELDS)
            info = infos.get(quote.symbol)
            row.update({"currency": getattr(info, "currency", None),
                        "exchange": getattr(info, "exchange", None),
                        "name": getattr(info, "name_cn", None),
                        "market_suffix": quote.symbol.rsplit(".", 1)[-1]})
            rows.append(row)
        returned = {row["symbol"] for row in rows}
        return {"quotes": rows, "missing_symbols": [s for s in symbols if s not in returned],
                "freshness": "以每条 timestamp 和账户行情权限为准；未判定为实时。",
                "price_unit": "每份证券报价，以 currency 为计价币种；期权乘数独立返回。"}

    def positions(self, symbols=None):
        if not self.allow_positions:
            raise GatewayError(403, "positions_disabled", "持仓读取尚未启用；需以 --allow-positions 启动。")
        sdk = self._sdk()
        response = self._context("TradeContext", sdk).stock_positions(symbols)
        rows = []
        for index, channel in enumerate(response.channels):
            for position in channel.positions:
                row = record(position, POSITION_FIELDS)
                row["channel_index"] = index
                rows.append(row)
        return {"positions": rows, "as_of": None,
                "timestamp_note": "上游持仓未提供时间戳；queried_at 为本次查询时间。",
                "cost_note": "cost_price 按账户所选成本口径返回，未计算收益。"}

    def exchange_rates(self):
        sdk = self._sdk()
        response = self._context("PortfolioContext", sdk).exchange_rate()
        return {"rates": [{
            # Official SDK defines average_rate as base_currency per other_currency.
            "from_currency": rate.other_currency, "to_currency": rate.base_currency,
            "rate": json_value(rate.average_rate), "bid_rate": json_value(rate.bid_rate),
            "offer_rate": json_value(rate.offer_rate),
            "rate_unit": "to_currency per 1 from_currency",
        } for rate in response.exchanges], "as_of": None,
            "timestamp_note": "上游汇率结果未提供时间戳；queried_at 为本次查询时间。"}

    def ipo_calendar(self, start, end):
        sdk = self._sdk()
        response = self._context("CalendarContext", sdk).finance_calendar(
            sdk.CalendarCategory.Ipo, start, end, "HK")
        groups = []
        for group in response.list:
            events = []
            for event in group.infos:
                row = record(event, EVENT_FIELDS)
                row["data_kv"] = [record(item, ("key", "value", "value_type", "value_raw"))
                                  for item in event.data_kv]
                events.append(row)
            groups.append({"date": group.date, "count": group.count, "events": events})
        return {"market": "HK", "start": start, "end": end, "groups": groups,
                "next_date": response.next_date,
                "coverage_note": "仅 IPO 日历；next_date 非空表示有后续页。未提供申购、中签或奖励。"}


class GatewayServer(HTTPServer):
    allow_reuse_address = False

    def __init__(self, address, static_root, backend):
        if address[0] != "127.0.0.1":
            raise ValueError("Only 127.0.0.1 is permitted")
        self.static_root = Path(static_root).resolve()
        self.backend = backend
        super().__init__(address, GatewayHandler)


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "PersonalFinanceReadGateway/1"

    def log_message(self, *_args):
        # Request paths may include private portfolio symbols. No request logging.
        pass

    def _reply(self, status, body, content_type="application/json; charset=utf-8"):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, error):
        self._reply(error.status, {"ok": False, "source": SOURCE, "queried_at": iso_now(),
                                   "error": {"code": error.code, "message": error.message}})

    def _check_local_request(self):
        port = self.server.server_port
        host = self.headers.get("Host", "")
        if host not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            raise GatewayError(403, "invalid_host", "仅允许本机地址访问。")
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{host}":
            raise GatewayError(403, "cross_origin_denied", "请从本机网关打开数据面板。")
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise GatewayError(403, "cross_origin_denied", "拒绝跨站读取。")

    def _static(self, path):
        if path in ("/", "/长桥数据.html", "/index.html"):
            destination = ("http://127.0.0.1:4176/" if path == "/index.html"
                           else quote("/洒一投资工具箱/长桥数据.html"))
            self.send_response(302)
            self.send_header("Location", destination)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        relative = path.lstrip("/")
        if relative not in STATIC_FILES:
            raise GatewayError(404, "not_found", "未开放此路径。")
        target = (self.server.static_root / relative).resolve()
        # Never let a whitelisted public name alias a secret file, even inside root.
        if (not target.is_relative_to(self.server.static_root)
                or target != self.server.static_root / relative or not target.is_file()):
            raise GatewayError(404, "not_found", "静态页面不存在。")
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or target.suffix == ".js":
            content_type += "; charset=utf-8"
        self._reply(200, target.read_bytes(), content_type)

    def do_GET(self):
        try:
            self._check_local_request()
            if len(self.path) > 4096:
                raise GatewayError(414, "request_too_long", "请求过长。")
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc:
                raise GatewayError(400, "invalid_path", "请使用相对路径。")
            path = unquote(parsed.path)
            prefix = "/api/longbridge/"
            if not path.startswith(prefix):
                self._static(path)
                return
            endpoint = path[len(prefix):]
            if endpoint not in {"status", "quotes", "option-quotes", "positions",
                                "exchange-rates", "ipo-calendar", "offers"}:
                raise GatewayError(404, "not_found", "未开放此接口。")
            if endpoint != "status" and self.headers.get("X-Finance-Request") != "1":
                raise GatewayError(403, "request_header_required", "缺少本机数据请求标识。")
            try:
                params = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=10)
            except ValueError:
                raise GatewayError(400, "invalid_query", "参数过多或无效。") from None
            allowed = {"quotes": {"symbols"}, "option-quotes": {"symbols"},
                       "positions": {"symbols"}, "ipo-calendar": {"start", "end"}}
            if set(params) - allowed.get(endpoint, set()):
                raise GatewayError(400, "invalid_query", "此接口不接受额外参数。")
            queried_at = iso_now()
            backend = self.server.backend
            if endpoint == "status":
                result = backend.status()
            elif endpoint in ("quotes", "option-quotes"):
                result = backend.quotes(symbols_from(params), options=endpoint == "option-quotes")
            elif endpoint == "positions":
                result = backend.positions(symbols_from(params, required=False))
            elif endpoint == "exchange-rates":
                result = backend.exchange_rates()
            elif endpoint == "ipo-calendar":
                result = backend.ipo_calendar(*dates_from(params))
            else:
                raise GatewayError(501, "offers_unavailable", "未接入开户、拉新或返佣活动数据。")
            self._reply(200, {"ok": True, "source": SOURCE, "queried_at": queried_at, "data": result})
        except GatewayError as error:
            self._error(error)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            # Upstream exceptions may contain token, signed URL or account details.
            self._error(GatewayError(502, "upstream_unavailable",
                                     "长桥查询失败，请检查凭证、连接、行情权限或请求参数；未使用替代数据。"))

    def do_POST(self):
        self._error(GatewayError(405, "read_only", "网关仅支持 GET，只读接口。"))

    do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_POST


def main():
    parser = argparse.ArgumentParser(description="长桥只读本机网关：前台启动一次，无自动重启。")
    parser.add_argument("--port", type=int, default=4190)
    parser.add_argument("--max-seconds", type=int, default=7200,
                        help="会话最长秒数（1–28800，默认 7200）；Ctrl+C 可提前结束。")
    parser.add_argument("--allow-positions", action="store_true", help="允许手动读取本人的持仓。")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.max_seconds <= 28800:
        parser.error("端口或会话时长超出允许范围。")
    root = Path(__file__).resolve().parent.parent
    try:
        server = GatewayServer(("127.0.0.1", args.port), root,
                               LongbridgeReads(allow_positions=args.allow_positions))
    except OSError:
        parser.exit(1, "启动失败：端口被占用或不可绑定。未重试，未停止已有服务。\n")
    server.timeout = 0.5
    deadline = time.monotonic() + args.max_seconds

    def stop(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    print(f"只读网关：http://127.0.0.1:{args.port}/长桥数据.html")
    print(f"前台运行，最长 {args.max_seconds} 秒；Ctrl+C 关闭。关闭浏览器页不会停止网关。")
    try:
        while time.monotonic() < deadline:
            server.handle_request()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("本次网关会话已结束。")


if __name__ == "__main__":
    main()
