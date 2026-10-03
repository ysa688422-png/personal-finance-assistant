import calendar
import hashlib
import json
import math
import re
import sqlite3
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import config
from ollama_client import OllamaError, embed


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalize_type(row):
    value = str(row.get("type") or row.get("direction") or "").lower()
    return "income" if value in ("income", "收入") or row.get("direction") == "收入" else "expense"


def normalize_date(value):
    text = str(value or "")[:10]
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else ""


def normalize_tx(row):
    tx_type = normalize_type(row)
    category = str(row.get("category") or ("其他收入" if tx_type == "income" else "其他")).strip()
    note = str(row.get("note") or "").strip()
    merchant = str(row.get("merchant") or row.get("account") or note or category).strip()
    try:
        amount = round(abs(float(row.get("amount") or 0)), 2)
    except (TypeError, ValueError):
        amount = 0.0
    return {
        "date": normalize_date(row.get("date") or row.get("time") or row.get("transactionTime")),
        "type": tx_type,
        "amount": amount,
        "category": category,
        "merchant": merchant,
        "note": note,
    }


def fingerprint(tx):
    parts = [tx["date"], tx["type"], f'{tx["amount"]:.2f}', tx["category"], tx["merchant"], tx["note"]]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def identity_for(row, tx):
    record_id = str(row.get("id") or "").strip()
    while record_id.startswith("mobile-"):
        record_id = record_id[7:]
    return ("id:" + record_id) if record_id else ("fp:" + fingerprint(tx))


class FinanceIndex:
    def __init__(self, db_file=None):
        config.ensure_dirs()
        self.db_file = Path(db_file or config.DB_FILE)
        self.connection = sqlite3.connect(str(self.db_file))
        self.connection.row_factory = sqlite3.Row
        self._schema()

    def close(self):
        self.connection.close()

    def _schema(self):
        self.connection.executescript("""
        PRAGMA foreign_keys=ON;
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS sources(
          path TEXT PRIMARY KEY, kind TEXT NOT NULL, sha256 TEXT NOT NULL,
          mtime REAL NOT NULL, indexed_at TEXT NOT NULL, record_count INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS candidates(
          path TEXT NOT NULL, section TEXT NOT NULL, item_index INTEGER NOT NULL,
          identity TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
          original TEXT NOT NULL, rank INTEGER NOT NULL,
          PRIMARY KEY(path, section, item_index));
        CREATE TABLE IF NOT EXISTS transactions(
          identity TEXT PRIMARY KEY, date TEXT, type TEXT, amount REAL, category TEXT,
          merchant TEXT, note TEXT, conflict INTEGER NOT NULL DEFAULT 0,
          primary_path TEXT, primary_section TEXT, primary_index INTEGER, source_count INTEGER);
        CREATE TABLE IF NOT EXISTS tx_locations(
          identity TEXT, path TEXT, section TEXT, item_index INTEGER, file_hash TEXT,
          PRIMARY KEY(identity, path, section, item_index));
        CREATE TABLE IF NOT EXISTS assets(
          id TEXT PRIMARY KEY, name TEXT, type TEXT, balance REAL, date TEXT, note TEXT, source_path TEXT);
        CREATE TABLE IF NOT EXISTS debts(
          id TEXT PRIMARY KEY, name TEXT, type TEXT, due REAL, day INTEGER, note TEXT,
          paid_months TEXT, source_path TEXT);
        CREATE TABLE IF NOT EXISTS exclusions(path TEXT, section TEXT, item_index INTEGER, reason TEXT);
        CREATE TABLE IF NOT EXISTS documents(
          id TEXT PRIMARY KEY, title TEXT, content TEXT, source_path TEXT, data_date TEXT,
          embedding TEXT, content_hash TEXT);
        CREATE TABLE IF NOT EXISTS conflicts(identity TEXT PRIMARY KEY, details TEXT);
        CREATE TABLE IF NOT EXISTS proposals(
          id TEXT PRIMARY KEY, created_at TEXT, status TEXT, identity TEXT, field TEXT,
          old_value TEXT, new_value TEXT, reason TEXT, snapshot TEXT, confirmed_at TEXT);
        CREATE TABLE IF NOT EXISTS conversations(
          id TEXT PRIMARY KEY, title TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL, created_at TEXT NOT NULL,
          sources TEXT NOT NULL DEFAULT '[]', period TEXT, warnings TEXT NOT NULL DEFAULT '[]');
        CREATE INDEX IF NOT EXISTS messages_conversation_time
          ON messages(conversation_id, id);
        """)
        self.connection.commit()

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="microseconds")

    @staticmethod
    def _conversation_title(text):
        title = re.sub(r"\s+", " ", str(text or "")).strip()
        if not title:
            return "新对话"
        return title if len(title) <= 28 else title[:28].rstrip() + "…"

    def create_conversation(self, title=""):
        conversation_id = str(uuid.uuid4())
        now = self._now()
        clean_title = self._conversation_title(title)
        with self.connection:
            self.connection.execute(
                "INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)",
                (conversation_id, clean_title, now, now),
            )
        return self.get_conversation(conversation_id, include_messages=False)

    def conversation_exists(self, conversation_id):
        if not conversation_id:
            return False
        return self.connection.execute(
            "SELECT 1 FROM conversations WHERE id=?", (str(conversation_id),)
        ).fetchone() is not None

    def list_conversations(self, limit=100):
        try:
            limit = max(1, min(int(limit), 200))
        except (TypeError, ValueError):
            limit = 100
        rows = self.connection.execute(
            """
            SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(m.id) AS message_count,
                   COALESCE((SELECT content FROM messages p
                             WHERE p.conversation_id=c.id ORDER BY p.id DESC LIMIT 1),'') AS preview
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id=c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC, c.created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in rows]

    def get_conversation(self, conversation_id, include_messages=True):
        row = self.connection.execute(
            "SELECT id,title,created_at,updated_at FROM conversations WHERE id=?",
            (str(conversation_id),),
        ).fetchone()
        if row is None:
            raise KeyError("对话不存在")
        result = dict(row)
        if include_messages:
            messages = []
            for message in self.connection.execute(
                """SELECT id,role,content,created_at,sources,period,warnings
                   FROM messages WHERE conversation_id=? ORDER BY id""",
                (str(conversation_id),),
            ):
                item = dict(message)
                item["sources"] = json.loads(item["sources"] or "[]")
                item["period"] = json.loads(item["period"]) if item["period"] else None
                item["warnings"] = json.loads(item["warnings"] or "[]")
                messages.append(item)
            result["messages"] = messages
        return result

    def rename_conversation(self, conversation_id, title):
        clean_title = self._conversation_title(title)
        now = self._now()
        with self.connection:
            cursor = self.connection.execute(
                "UPDATE conversations SET title=?,updated_at=? WHERE id=?",
                (clean_title, now, str(conversation_id)),
            )
            if cursor.rowcount != 1:
                raise KeyError("对话不存在")
        return self.get_conversation(conversation_id, include_messages=False)

    def delete_conversation(self, conversation_id):
        with self.connection:
            # Do not rely only on the foreign-key pragma: explicit deletion also
            # keeps old databases safe if they were opened before FK was enabled.
            exists = self.conversation_exists(conversation_id)
            if not exists:
                raise KeyError("对话不存在")
            self.connection.execute("DELETE FROM messages WHERE conversation_id=?", (str(conversation_id),))
            self.connection.execute("DELETE FROM conversations WHERE id=?", (str(conversation_id),))
        return {"deleted": str(conversation_id)}

    def add_exchange(self, conversation_id, user_content, assistant_content,
                     sources=None, period=None, warnings=None):
        if not self.conversation_exists(conversation_id):
            raise KeyError("对话不存在")
        user_content = str(user_content or "").strip()
        assistant_content = str(assistant_content or "").strip()
        if not user_content or not assistant_content:
            raise ValueError("对话内容不能为空")
        now = self._now()
        with self.connection:
            user_cursor = self.connection.execute(
                """INSERT INTO messages(conversation_id,role,content,created_at,sources,period,warnings)
                   VALUES(?,?,?,?,?,?,?)""",
                (str(conversation_id), "user", user_content, now, "[]", None, "[]"),
            )
            assistant_cursor = self.connection.execute(
                """INSERT INTO messages(conversation_id,role,content,created_at,sources,period,warnings)
                   VALUES(?,?,?,?,?,?,?)""",
                (str(conversation_id), "assistant", assistant_content, now,
                 canonical_json(sources or []), canonical_json(period) if period else None,
                 canonical_json(warnings or [])),
            )
            row = self.connection.execute(
                "SELECT title,(SELECT COUNT(*) FROM messages WHERE conversation_id=?) AS message_count "
                "FROM conversations WHERE id=?",
                (str(conversation_id), str(conversation_id)),
            ).fetchone()
            title = row["title"]
            if row["message_count"] == 2 and title == "新对话":
                title = self._conversation_title(user_content)
            self.connection.execute(
                "UPDATE conversations SET title=?,updated_at=? WHERE id=?",
                (title, now, str(conversation_id)),
            )
        return {
            "user_message_id": user_cursor.lastrowid,
            "assistant_message_id": assistant_cursor.lastrowid,
            "title": title,
        }

    def conversation_context(self, conversation_id, max_messages=16, max_characters=12000):
        """Return the newest useful dialogue context in chronological order."""
        if not self.conversation_exists(conversation_id):
            raise KeyError("对话不存在")
        max_messages = max(0, min(int(max_messages), 40))
        max_characters = max(0, min(int(max_characters), 40000))
        rows = list(self.connection.execute(
            """SELECT role,content FROM messages WHERE conversation_id=?
               ORDER BY id DESC LIMIT ?""",
            (str(conversation_id), max_messages),
        ))
        selected = []
        used = 0
        for row in rows:
            content = row["content"]
            remaining = max_characters - used
            if remaining <= 0:
                break
            if len(content) > remaining:
                # Keeping the end is more useful for a recent assistant answer,
                # while the role and ordering still remain explicit.
                content = content[-remaining:]
            selected.append({"role": row["role"], "content": content})
            used += len(content)
        return list(reversed(selected))

    def source_files(self):
        files = []
        if config.SYNC_DIR.exists():
            files.extend(sorted(config.SYNC_DIR.glob("手机记账-????-??-导入财务管理.json")))
            full = config.SYNC_DIR / "手机记账-全部同步.json"
            if full.exists():
                files.append(full)
        if config.ASSET_BACKUP_DIR.exists():
            backups = sorted(config.ASSET_BACKUP_DIR.glob("资产管理-????-??-??.json"))
            if backups:
                files.append(backups[-1])
        return files

    def sync(self, with_embeddings=True):
        files = self.source_files()
        current = {str(path): sha256_file(path) for path in files}
        known = {row["path"]: row["sha256"] for row in self.connection.execute("SELECT path, sha256 FROM sources")}
        changed = [Path(path) for path, digest in current.items() if known.get(path) != digest]
        removed = [path for path in known if path not in current]
        if not changed and not removed:
            with self.connection:
                self._index_documents(with_embeddings=with_embeddings)
            return {"changed": 0, "removed": 0, **self.status()}
        with self.connection:
            for path in removed:
                self.connection.execute("DELETE FROM candidates WHERE path=?", (path,))
                self.connection.execute("DELETE FROM sources WHERE path=?", (path,))
            for path in changed:
                self._index_source(path, current[str(path)])
            self._rebuild_canonical()
            self._index_documents(with_embeddings=with_embeddings)
        return {"changed": len(changed), "removed": len(removed), **self.status()}

    def _kind_rank(self, path):
        name = path.name
        if name == "手机记账-全部同步.json":
            return "full_sync", 500
        if name.startswith("手机记账-"):
            return "monthly_sync", 400
        return "asset_backup", 300

    def _index_source(self, path, digest):
        kind, rank = self._kind_rank(path)
        data = json.loads(path.read_text(encoding="utf-8"))
        self.connection.execute("DELETE FROM candidates WHERE path=?", (str(path),))
        self.connection.execute("DELETE FROM exclusions WHERE path=?", (str(path),))
        count = 0
        if kind == "full_sync":
            sections = [("records", data.get("records") or [])]
        elif kind == "monthly_sync":
            rows = data.get("records") or data.get("transactions") or []
            sections = [("records" if data.get("records") else "transactions", rows)]
        else:
            sections = [("transactions", data.get("transactions") or [])]
        for section, rows in sections:
            for index, original in enumerate(rows):
                tx = normalize_tx(original)
                reason = self._exclude_reason(original, tx)
                if reason:
                    self.connection.execute("INSERT INTO exclusions VALUES(?,?,?,?)", (str(path), section, index, reason))
                    continue
                if not tx["date"] or tx["amount"] <= 0:
                    self.connection.execute("INSERT INTO exclusions VALUES(?,?,?,?)", (str(path), section, index, "缺失日期或金额无效"))
                    continue
                identity = identity_for(original, tx)
                self.connection.execute(
                    "INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?)",
                    (str(path), section, index, identity, fingerprint(tx), canonical_json(tx), canonical_json(original), rank),
                )
                count += 1
        if kind == "asset_backup":
            self.connection.execute("DELETE FROM assets")
            self.connection.execute("DELETE FROM debts")
            for item in data.get("assets") or []:
                if self._is_investment(item):
                    self.connection.execute("INSERT INTO exclusions VALUES(?,?,?,?)", (str(path), "assets", -1, "投资数据接口未启用"))
                    continue
                self.connection.execute("INSERT OR REPLACE INTO assets VALUES(?,?,?,?,?,?,?)", (
                    str(item.get("id") or fingerprint(normalize_tx(item))), str(item.get("name") or "未命名资产"),
                    str(item.get("type") or "other"), float(item.get("balance") or 0), normalize_date(item.get("date")),
                    str(item.get("note") or ""), str(path)))
            for item in data.get("debts") or []:
                self.connection.execute("INSERT OR REPLACE INTO debts VALUES(?,?,?,?,?,?,?,?)", (
                    str(item.get("id") or hashlib.sha256(canonical_json(item).encode()).hexdigest()), str(item.get("name") or "未命名负债"),
                    str(item.get("type") or "other"), float(item.get("due") or 0), int(item.get("day") or 1),
                    str(item.get("note") or ""), canonical_json(item.get("paidMonths") or []), str(path)))
        self.connection.execute("INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?,?)", (
            str(path), kind, digest, path.stat().st_mtime, datetime.now().isoformat(timespec="seconds"), count))

    def _exclude_reason(self, original, tx):
        text = canonical_json(original)
        if any(word in text for word in config.WORK_KEYWORDS):
            return "工作资料永久排除"
        if any(word in text for word in config.INVESTMENT_KEYWORDS) or tx["category"] in ("投资收益", "理财"):
            return "投资数据接口未启用"
        return ""

    def _is_investment(self, item):
        text = canonical_json(item)
        return str(item.get("type")) == "investment" or any(word in text for word in config.INVESTMENT_KEYWORDS)

    def _rebuild_canonical(self):
        self.connection.execute("DELETE FROM transactions")
        self.connection.execute("DELETE FROM tx_locations")
        self.connection.execute("DELETE FROM conflicts")
        groups = defaultdict(list)
        for row in self.connection.execute("SELECT * FROM candidates ORDER BY rank DESC, path, item_index"):
            groups[row["identity"]].append(row)
        source_hashes = {row["path"]: row["sha256"] for row in self.connection.execute("SELECT path,sha256 FROM sources")}
        for identity, rows in groups.items():
            primary = rows[0]
            tx = json.loads(primary["payload"])
            unique = {row["fingerprint"] for row in rows}
            conflict = int(len(unique) > 1)
            self.connection.execute("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (
                identity, tx["date"], tx["type"], tx["amount"], tx["category"], tx["merchant"], tx["note"], conflict,
                primary["path"], primary["section"], primary["item_index"], len(rows)))
            for row in rows:
                self.connection.execute("INSERT INTO tx_locations VALUES(?,?,?,?,?)", (
                    identity, row["path"], row["section"], row["item_index"], source_hashes.get(row["path"], "")))
            if conflict:
                details = [{"path": row["path"], "section": row["section"], "index": row["item_index"], "value": json.loads(row["payload"])} for row in rows]
                self.connection.execute("INSERT INTO conflicts VALUES(?,?)", (identity, canonical_json(details)))

    def _index_documents(self, with_embeddings=True):
        docs = []
        if config.RULES_FILE.exists():
            content = config.RULES_FILE.read_text(encoding="utf-8")
            sections = re.split(r"(?=^## )", content, flags=re.M)
            for i, section in enumerate(sections):
                if section.strip():
                    docs.append((f"rules:{i}", section.splitlines()[0].lstrip("# "), section.strip(), str(config.RULES_FILE), "2026-08-12"))
        months = [row[0] for row in self.connection.execute("SELECT DISTINCT substr(date,1,7) FROM transactions ORDER BY 1")]
        for month in months:
            summary = self.summary(month + "-01", self._month_end(month))
            docs.append((f"month:{month}", f"{month}月度摘要", canonical_json(summary), "本地结构化索引", month))
        old = {row["id"]: row for row in self.connection.execute("SELECT * FROM documents")}
        payloads = []
        pending = []
        for doc in docs:
            digest = hashlib.sha256(doc[2].encode("utf-8")).hexdigest()
            embedding = old[doc[0]]["embedding"] if doc[0] in old and old[doc[0]]["content_hash"] == digest else None
            if with_embeddings and (not embedding or (doc[0] in old and old[doc[0]]["content_hash"] != digest)):
                pending.append(doc[2])
            payloads.append([*doc, embedding, digest])
        if pending:
            try:
                vectors = iter(embed(pending))
                for payload in payloads:
                    if not payload[5] or (payload[0] in old and old[payload[0]]["content_hash"] != payload[6]):
                        payload[5] = canonical_json(next(vectors))
            except (OllamaError, StopIteration):
                pass
        self.connection.execute("DELETE FROM documents")
        self.connection.executemany("INSERT INTO documents VALUES(?,?,?,?,?,?,?)", payloads)

    @staticmethod
    def _month_end(month):
        year, number = map(int, month.split("-"))
        return f"{year:04d}-{number:02d}-{calendar.monthrange(year, number)[1]:02d}"

    def status(self):
        row = self.connection.execute("SELECT MIN(date) first_date, MAX(date) last_date, COUNT(*) count, SUM(conflict) conflicts FROM transactions").fetchone()
        excluded = self.connection.execute("SELECT COUNT(*) FROM exclusions").fetchone()[0]
        sources = self.connection.execute("SELECT COUNT(*) FROM sources").fetchone()[0]
        embedded = self.connection.execute("SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL AND embedding!=''").fetchone()[0]
        return {"transactions": row["count"] or 0, "first_date": row["first_date"], "last_date": row["last_date"],
                "conflicts": row["conflicts"] or 0, "excluded": excluded, "sources": sources, "embedded_documents": embedded}

    def summary(self, start, end):
        rows = list(self.connection.execute("SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY date", (start, end)))
        income = sum(row["amount"] for row in rows if row["type"] == "income")
        expense = sum(row["amount"] for row in rows if row["type"] == "expense")
        categories = defaultdict(float)
        for row in rows:
            if row["type"] == "expense":
                categories[row["category"] or "其他"] += row["amount"]
        top = sorted(categories.items(), key=lambda item: item[1], reverse=True)[:8]
        source_paths = sorted({row["primary_path"] for row in rows})
        conflicts = sum(row["conflict"] for row in rows)
        return {"period": {"start": start, "end": end}, "income": round(income, 2), "expense": round(expense, 2),
                "balance": round(income - expense, 2), "count": len(rows), "top_expense_categories": [[name, round(value, 2)] for name, value in top],
                "conflicts": conflicts, "sources": source_paths}

    def assets_debts(self):
        assets = list(self.connection.execute("SELECT * FROM assets ORDER BY balance DESC"))
        debts = list(self.connection.execute("SELECT * FROM debts ORDER BY due DESC"))
        return {"assets": [dict(row) for row in assets], "debts": [dict(row) for row in debts],
                "asset_total": round(sum(row["balance"] for row in assets), 2), "debt_total": round(sum(row["due"] for row in debts), 2)}

    def query_period(self, query):
        match = re.search(r"(20\d{2})[年\-/](\d{1,2})月?", query)
        if match:
            month = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"
            return month + "-01", self._month_end(month)
        latest = self.status().get("last_date") or date.today().isoformat()
        base = datetime.strptime(latest[:7] + "-01", "%Y-%m-%d").date()
        if "上月" in query:
            base = base.replace(day=1) - timedelta(days=1)
        if "今年" in query or "本年" in query:
            return f"{base.year}-01-01", f"{base.year}-12-31"
        if "去年" in query:
            return f"{base.year-1}-01-01", f"{base.year-1}-12-31"
        month = base.strftime("%Y-%m")
        return month + "-01", self._month_end(month)

    def retrieve_docs(self, query, limit=4):
        docs = list(self.connection.execute("SELECT * FROM documents WHERE embedding IS NOT NULL AND embedding!=''"))
        if not docs:
            return []
        try:
            vector = embed([query])[0]
        except (OllamaError, IndexError):
            return []
        def cosine(row):
            other = json.loads(row["embedding"])
            dot = sum(a*b for a, b in zip(vector, other))
            denom = math.sqrt(sum(a*a for a in vector)) * math.sqrt(sum(b*b for b in other))
            return dot / denom if denom else 0
        return [dict(row) for row in sorted(docs, key=cosine, reverse=True)[:limit]]

    def search_transactions(self, query="", month="", limit=30):
        sql = "SELECT * FROM transactions WHERE 1=1"
        args = []
        if month:
            sql += " AND date LIKE ?"
            args.append(month + "%")
        if query:
            sql += " AND (category LIKE ? OR merchant LIKE ? OR note LIKE ? OR date LIKE ?)"
            args.extend([f"%{query}%"] * 4)
        sql += " ORDER BY date DESC, amount DESC LIMIT ?"
        args.append(min(int(limit), 100))
        return [dict(row) for row in self.connection.execute(sql, args)]
