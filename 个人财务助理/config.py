from pathlib import Path
import os

ROOT = Path(os.environ.get("SAYI_FINANCE_ROOT", str(Path(__file__).resolve().parent)))
SOURCE_ROOT = Path(os.environ.get("SAYI_FINANCE_SOURCE_ROOT", str(ROOT.parent)))
SYNC_DIR = SOURCE_ROOT / "财务管理" / "手机记账同步"
ASSET_BACKUP_DIR = SOURCE_ROOT / "数据备份" / "财务管理"
RULES_FILE = ROOT / "rules" / "personal-finance-rules.md"
DB_FILE = ROOT / "index" / "finance.sqlite3"
AUDIT_FILE = ROOT / "audit" / "audit.jsonl"
PROPOSAL_DIR = ROOT / "changes"
BACKUP_DIR = ROOT / "backups"
STATIC_DIR = ROOT / "static"
OLLAMA_URL = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
CHAT_MODEL = "sayi-finance:9b"
EMBED_MODEL = "qwen3-embedding:0.6b"
APP_PORT = int(os.environ.get("SAYI_FINANCE_PORT", "4188"))
HISTORY_MAX_MESSAGES = int(os.environ.get("SAYI_FINANCE_HISTORY_MESSAGES", "16"))
HISTORY_MAX_CHARACTERS = int(os.environ.get("SAYI_FINANCE_HISTORY_CHARACTERS", "12000"))
MESSAGE_MAX_CHARACTERS = int(os.environ.get("SAYI_FINANCE_MESSAGE_CHARACTERS", "8000"))

WORK_KEYWORDS = ("路桥", "欠费商户", "欠费查询", "开票", "履约保证金", "商户清单")
INVESTMENT_KEYWORDS = ("股票", "持仓", "期权", "基金", "打新", "投资奖励", "交易策略", "融资仓位")

def ensure_dirs():
    for path in (ROOT, DB_FILE.parent, AUDIT_FILE.parent, PROPOSAL_DIR, BACKUP_DIR, RULES_FILE.parent):
        path.mkdir(parents=True, exist_ok=True)
