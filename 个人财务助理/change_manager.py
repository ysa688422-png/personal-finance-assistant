import json
import os
import shutil
import sqlite3
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

import config
from indexer import FinanceIndex, canonical_json, fingerprint, normalize_tx, sha256_file


EDITABLE_FIELDS = {"date", "amount", "category", "merchant", "note", "type"}


def audit(event, details):
    config.ensure_dirs()
    record = {"at": datetime.now().isoformat(timespec="seconds"), "event": event, **details}
    with config.AUDIT_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _validate_new_value(field, value):
    if field == "amount":
        value = round(abs(float(value)), 2)
        if value <= 0:
            raise ValueError("金额必须大于 0")
    elif field == "date":
        datetime.strptime(str(value), "%Y-%m-%d")
        value = str(value)
    elif field == "type":
        if value not in ("income", "expense", "收入", "支出"):
            raise ValueError("收支类型无效")
        value = "income" if value in ("income", "收入") else "expense"
    else:
        value = str(value).strip()
        if not value:
            raise ValueError("新值不能为空")
    return value


def create_proposal(index, identity, field, new_value, reason):
    if field not in EDITABLE_FIELDS:
        raise ValueError("不允许修改这个字段")
    reason = str(reason or "").strip()
    if not reason:
        raise ValueError("必须填写修改原因")
    row = index.connection.execute("SELECT * FROM transactions WHERE identity=?", (identity,)).fetchone()
    if not row:
        raise ValueError("没有找到这笔记录")
    new_value = _validate_new_value(field, new_value)
    old_value = row[field]
    if str(old_value) == str(new_value):
        raise ValueError("新值与旧值相同")
    locations = [dict(item) for item in index.connection.execute("SELECT * FROM tx_locations WHERE identity=? ORDER BY path", (identity,))]
    if not locations:
        raise ValueError("没有可安全写回的原始位置")
    allowed = {str(path.resolve()) for path in index.source_files()}
    for location in locations:
        resolved = str(Path(location["path"]).resolve())
        if resolved not in allowed:
            raise ValueError("目标文件不在个人财务白名单中")
    proposal_id = uuid.uuid4().hex
    snapshot = {"record": dict(row), "locations": locations}
    with index.connection:
        index.connection.execute("INSERT INTO proposals VALUES(?,?,?,?,?,?,?,?,?,?)", (
            proposal_id, datetime.now().isoformat(timespec="seconds"), "pending", identity, field,
            canonical_json(old_value), canonical_json(new_value), reason, canonical_json(snapshot), None))
    proposal = {"id": proposal_id, "status": "pending", "identity": identity, "field": field,
                "old_value": old_value, "new_value": new_value, "reason": reason,
                "files": [item["path"] for item in locations]}
    audit("proposal_created", proposal)
    return proposal


def _update_item(item, field, value):
    if field == "type":
        if "type" in item:
            item["type"] = value if item["type"] in ("income", "expense") else ("收入" if value == "income" else "支出")
        if "direction" in item:
            item["direction"] = "收入" if value == "income" else "支出"
    elif field == "merchant" and "merchant" not in item:
        item["note"] = value
    else:
        item[field] = value


def confirm_proposal(index, proposal_id):
    row = index.connection.execute("SELECT * FROM proposals WHERE id=?", (proposal_id,)).fetchone()
    if not row or row["status"] != "pending":
        raise ValueError("修改建议不存在或已经处理")
    snapshot = json.loads(row["snapshot"])
    locations = snapshot["locations"]
    for location in locations:
        path = Path(location["path"])
        if not path.exists() or sha256_file(path) != location["file_hash"]:
            raise ValueError(f"源文件已变化，未写入：{path.name}。请重新同步并生成建议。")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + proposal_id[:8]
    backup_root = config.BACKUP_DIR / stamp
    backup_root.mkdir(parents=True, exist_ok=False)
    backups = []
    changed = []
    prepared = {}
    unique_paths = sorted({item["path"] for item in locations})
    for path_text in unique_paths:
        path = Path(path_text)
        backup_path = backup_root / path.name
        shutil.copy2(path, backup_path)
        backups.append(str(backup_path))
        data = json.loads(path.read_text(encoding="utf-8"))
        hits = [item for item in locations if item["path"] == path_text]
        for location in hits:
            rows = data.get(location["section"])
            if not isinstance(rows, list) or location["item_index"] >= len(rows):
                raise ValueError("写回前复核失败：记录位置已变化")
            before = normalize_tx(rows[location["item_index"]])
            before_fingerprint = fingerprint(before)
            _update_item(rows[location["item_index"]], row["field"], json.loads(row["new_value"]))
            changed.append({"path": path_text, "section": location["section"], "index": location["item_index"]})
            companion = "transactions" if location["section"] == "records" else "records"
            companion_rows = data.get(companion)
            if isinstance(companion_rows, list):
                matches = [i for i, item in enumerate(companion_rows) if fingerprint(normalize_tx(item)) == before_fingerprint]
                if len(matches) == 1:
                    companion_index = matches[0]
                    _update_item(companion_rows[companion_index], row["field"], json.loads(row["new_value"]))
                    changed.append({"path": path_text, "section": companion, "index": companion_index})
        prepared[path_text] = data
    replaced = []
    try:
      for path_text in unique_paths:
        path = Path(path_text)
        data = prepared[path_text]
        fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temporary, path)
            replaced.append(path_text)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    except Exception:
        for path_text in replaced:
            backup_path = backup_root / Path(path_text).name
            shutil.copy2(backup_path, path_text)
        audit("write_rolled_back", {"id": proposal_id, "restored": replaced})
        raise

    with index.connection:
        index.connection.execute("UPDATE proposals SET status='confirmed', confirmed_at=? WHERE id=?", (
            datetime.now().isoformat(timespec="seconds"), proposal_id))
    audit("proposal_confirmed", {"id": proposal_id, "field": row["field"], "old_value": json.loads(row["old_value"]),
                                  "new_value": json.loads(row["new_value"]), "reason": row["reason"],
                                  "backups": backups, "changed": changed})
    index.sync(with_embeddings=False)
    verified = index.connection.execute("SELECT * FROM transactions WHERE identity=?", (row["identity"],)).fetchone()
    actual = verified[row["field"]] if verified else None
    expected = json.loads(row["new_value"])
    if str(actual) != str(expected):
        audit("verification_warning", {"id": proposal_id, "expected": expected, "actual": actual})
        raise ValueError("文件已写入并备份，但索引复核不一致，请查看审计记录")
    return {"id": proposal_id, "status": "confirmed", "verified_value": actual, "backups": backups}


def reject_proposal(index, proposal_id):
    with index.connection:
        cursor = index.connection.execute("UPDATE proposals SET status='rejected', confirmed_at=? WHERE id=? AND status='pending'", (
            datetime.now().isoformat(timespec="seconds"), proposal_id))
    if cursor.rowcount != 1:
        raise ValueError("修改建议不存在或已经处理")
    audit("proposal_rejected", {"id": proposal_id})
    return {"id": proposal_id, "status": "rejected"}
