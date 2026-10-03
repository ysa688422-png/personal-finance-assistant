import json
import urllib.error
import urllib.request

from config import OLLAMA_URL, CHAT_MODEL, EMBED_MODEL


class OllamaError(RuntimeError):
    pass


def _post(path, payload, timeout=180):
    request = urllib.request.Request(
        OLLAMA_URL + path,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OllamaError(str(exc)) from exc


def chat(messages):
    data = _post("/api/chat", {
        "model": CHAT_MODEL,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {"temperature": 0.2},
    })
    return data.get("message", {}).get("content", "").strip()


def embed(texts):
    if not texts:
        return []
    data = _post("/api/embed", {"model": EMBED_MODEL, "input": texts}, timeout=300)
    return data.get("embeddings", [])


def tags():
    request = urllib.request.Request(OLLAMA_URL + "/api/tags")
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise OllamaError(str(exc)) from exc
