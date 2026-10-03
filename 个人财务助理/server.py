#!/usr/bin/env python3
import argparse
import json
import mimetypes
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import config
from change_manager import confirm_proposal, create_proposal, reject_proposal
from indexer import FinanceIndex
from ollama_client import OllamaError, chat, tags


SESSION_TOKEN = secrets.token_urlsafe(32)
INDEX_LOCK = threading.Lock()
INDEX = None


def json_safe(value):
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def source_label(path):
    try:
        return str(Path(path).relative_to(config.SOURCE_ROOT))
    except ValueError:
        return str(path)


def build_context(query):
    start, end = INDEX.query_period(query)
    summary = INDEX.summary(start, end)
    assets = INDEX.assets_debts()
    docs = INDEX.retrieve_docs(query)
    source_dates = {}
    for path in summary["sources"]:
        row = INDEX.connection.execute("SELECT MAX(date) AS data_date FROM transactions WHERE primary_path=?", (path,)).fetchone()
        source_dates[path] = row["data_date"] or "日期未知"
    for item in (assets["assets"] + assets["debts"]):
        source_dates[item["source_path"]] = item.get("date") or source_dates.get(item["source_path"]) or "日期未知"
    sources = [{"id": i + 1, "file": source_label(path), "data_date": source_dates[path]} for i, path in enumerate(source_dates)]
    facts = {
        "query_period": summary["period"],
        "deterministic_summary": {key: value for key, value in summary.items() if key != "sources"},
        "non_investment_assets_and_debts": assets,
        "index_status": INDEX.status(),
        "source_numbers": [{"source": item["id"], "file": item["file"], "data_date": item["data_date"]} for item in sources],
        "retrieved_rules": [{"title": row["title"], "content": row["content"][:1800]} for row in docs if row["id"].startswith("rules:")],
    }
    return facts, sources


def query_guard(query):
    if any(word in query for word in config.WORK_KEYWORDS):
        return "work"
    if any(word in query for word in config.INVESTMENT_KEYWORDS):
        return "investment"
    return None


def safe_history_text(query):
    kind = query_guard(query)
    if kind == "work":
        return "[已阻止的工作资料请求]"
    if kind == "investment":
        return "[投资接口未启用的请求]"
    return query


def safe_conversation_title(title):
    return safe_history_text(str(title or ""))


def answer(query, history=None):
    guard = query_guard(query)
    if guard == "work":
        return {"answer": "这属于路桥工作资料，已被个人财务助理永久排除。我不会检索、分析或写入这些内容。", "sources": [], "period": None, "warnings": ["工作资料已隔离"]}
    if guard == "investment":
        return {"answer": "当前版本的投资数据接口处于关闭状态，因此不分析持仓、期权、打新或投资交易。个人收支、非投资资产、负债和现金流仍可正常分析。", "sources": [], "period": None, "warnings": ["投资接口未启用"]}
    facts, sources = build_context(query)
    prompt = (
        "下面是本地程序从白名单个人财务文件中计算出的事实。金额必须原样采用，不得重新猜算。"
        "若冲突数大于0或数据截止日期早于提问需要，先提示限制。每个重要结论用[来源N]标注。\n\n"
        + json.dumps(facts, ensure_ascii=False, indent=2)
    )
    messages = [{"role": "system", "content": prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": query})
    result = chat(messages)
    if sources and not re.search(r"\[来源\d+\]", result):
        references = "、".join(f"[来源{item['id']}]" for item in sources)
        result += f"\n\n数据依据：{references}；数据期间见右侧来源栏。"
    warnings = []
    last_date = facts["index_status"].get("last_date")
    if last_date and facts["query_period"]["end"] > last_date:
        warnings.append(f"查询周期尚未结束或数据未同步完整；当前只覆盖到 {last_date}")
    if facts["deterministic_summary"]["conflicts"]:
        warnings.append(f"当前期间有 {facts['deterministic_summary']['conflicts']} 条冲突记录，结论需人工核对")
    return {"answer": result, "sources": sources, "period": facts["query_period"], "warnings": warnings}


class Handler(BaseHTTPRequestHandler):
    server_version = "SayiFinance/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, payload, status=200):
        body = json.dumps(json_safe(payload), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def _authorized(self):
        expected_origin = f"http://127.0.0.1:{config.APP_PORT}"
        origin = self.headers.get("Origin")
        return secrets.compare_digest(self.headers.get("X-Sayi-Token", ""), SESSION_TOKEN) and (not origin or origin == expected_origin)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/bootstrap":
            return self._json({"token": SESSION_TOKEN, "status": INDEX.status(), "investment_enabled": False})
        if parsed.path == "/api/status":
            model_names = []
            try:
                model_names = [item.get("name") or item.get("model") for item in tags().get("models", [])]
            except OllamaError:
                pass
            return self._json({"index": INDEX.status(), "ollama": bool(model_names),
                               "chat_model": config.CHAT_MODEL in model_names, "embedding_model": config.EMBED_MODEL in model_names,
                               "investment_enabled": False})
        if parsed.path == "/api/transactions":
            params = urllib.parse.parse_qs(parsed.query)
            return self._json({"items": INDEX.search_transactions(params.get("q", [""])[0], params.get("month", [""])[0])})
        if parsed.path == "/api/proposals":
            rows = [dict(row) for row in INDEX.connection.execute("SELECT * FROM proposals ORDER BY created_at DESC LIMIT 50")]
            for row in rows:
                row["old_value"] = json.loads(row["old_value"])
                row["new_value"] = json.loads(row["new_value"])
                row.pop("snapshot", None)
            return self._json({"items": rows})
        if parsed.path == "/api/conversations":
            if not self._authorized():
                return self._json({"error": "本机安全令牌无效"}, 403)
            params = urllib.parse.parse_qs(parsed.query)
            return self._json({"items": INDEX.list_conversations(params.get("limit", [100])[0])})
        if parsed.path.startswith("/api/conversations/"):
            if not self._authorized():
                return self._json({"error": "本机安全令牌无效"}, 403)
            parts = parsed.path.strip("/").split("/")
            if len(parts) != 3:
                return self._json({"error": "地址无效"}, 404)
            try:
                return self._json({"conversation": INDEX.get_conversation(urllib.parse.unquote(parts[2]))})
            except KeyError as exc:
                return self._json({"error": str(exc.args[0])}, 404)
        if parsed.path in ("/", "/index.html"):
            target = config.STATIC_DIR / "index.html"
        else:
            target = (config.STATIC_DIR / parsed.path.lstrip("/")).resolve()
            if config.STATIC_DIR.resolve() not in target.parents:
                return self._json({"error": "not found"}, 404)
        if not target.exists() or not target.is_file():
            return self._json({"error": "not found"}, 404)
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "style-src 'self'; "
            "script-src 'self' https://www.youtube.com; "
            "img-src 'self' data: https://i.ytimg.com; "
            "connect-src 'self' https://www.youtube.com; "
            "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
        )
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self._authorized():
            return self._json({"error": "本机安全令牌无效"}, 403)
        try:
            payload = self._body()
            if self.path == "/api/sync":
                with INDEX_LOCK:
                    result = INDEX.sync(with_embeddings=True)
                return self._json(result)
            if self.path == "/api/chat":
                query = str(payload.get("message") or "").strip()
                if not query:
                    raise ValueError("问题不能为空")
                if len(query) > config.MESSAGE_MAX_CHARACTERS:
                    raise ValueError(f"单条消息不能超过 {config.MESSAGE_MAX_CHARACTERS} 个字符")
                conversation_id = str(payload.get("conversation_id") or "").strip()
                history = []
                if conversation_id:
                    history = INDEX.conversation_context(
                        conversation_id,
                        max_messages=config.HISTORY_MAX_MESSAGES,
                        max_characters=config.HISTORY_MAX_CHARACTERS,
                    )
                result = answer(query, history=history)
                if not conversation_id:
                    conversation_id = INDEX.create_conversation()["id"]
                exchange = INDEX.add_exchange(
                    conversation_id,
                    safe_history_text(query),
                    result["answer"],
                    sources=result.get("sources"),
                    period=result.get("period"),
                    warnings=result.get("warnings"),
                )
                result.update({
                    "conversation_id": conversation_id,
                    "title": exchange["title"],
                    "user_message_id": exchange["user_message_id"],
                    "assistant_message_id": exchange["assistant_message_id"],
                })
                return self._json(result)
            if self.path == "/api/conversations":
                return self._json({
                    "conversation": INDEX.create_conversation(
                        safe_conversation_title(payload.get("title") or "")
                    )
                }, 201)
            if self.path.startswith("/api/conversations/"):
                parts = self.path.strip("/").split("/")
                if len(parts) == 4 and parts[3] == "rename":
                    return self._json({
                        "conversation": INDEX.rename_conversation(
                            urllib.parse.unquote(parts[2]),
                            safe_conversation_title(payload.get("title") or ""),
                        )
                    })
                return self._json({"error": "not found"}, 404)
            if self.path == "/api/proposals":
                return self._json(create_proposal(INDEX, payload.get("identity"), payload.get("field"), payload.get("new_value"), payload.get("reason")), 201)
            if self.path.startswith("/api/proposals/"):
                parts = self.path.strip("/").split("/")
                if len(parts) != 4:
                    raise ValueError("地址无效")
                proposal_id, action = parts[2], parts[3]
                if action == "confirm":
                    return self._json(confirm_proposal(INDEX, proposal_id))
                if action == "reject":
                    return self._json(reject_proposal(INDEX, proposal_id))
            return self._json({"error": "not found"}, 404)
        except OllamaError as exc:
            return self._json({"error": "Ollama 暂时不可用，请先打开 Ollama。", "detail": str(exc)}, 503)
        except KeyError as exc:
            return self._json({"error": str(exc.args[0])}, 404)
        except (ValueError, json.JSONDecodeError) as exc:
            return self._json({"error": str(exc)}, 400)
        except Exception as exc:
            return self._json({"error": "操作失败，原始文件未改动。", "detail": str(exc)}, 500)

    def do_DELETE(self):
        if not self._authorized():
            return self._json({"error": "本机安全令牌无效"}, 403)
        parsed = urllib.parse.urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "conversations"]:
            return self._json({"error": "not found"}, 404)
        try:
            return self._json(INDEX.delete_conversation(urllib.parse.unquote(parts[2])))
        except KeyError as exc:
            return self._json({"error": str(exc.args[0])}, 404)
        except Exception as exc:
            return self._json({"error": "删除对话失败", "detail": str(exc)}, 500)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--no-embeddings", action="store_true")
    args = parser.parse_args()
    global INDEX
    config.ensure_dirs()
    INDEX = FinanceIndex()
    INDEX.sync(with_embeddings=not args.no_embeddings)
    server = HTTPServer(("127.0.0.1", config.APP_PORT), Handler)
    url = f"http://127.0.0.1:{config.APP_PORT}/"
    print(f"个人财务助理已启动：{url}", flush=True)
    if not args.no_open:
        subprocess.Popen(["open", url])
    def stop_on_term(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_on_term)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        INDEX.close()
        server.server_close()


if __name__ == "__main__":
    main()
