#!/bin/zsh
set -e
APP_DIR="${0:A:h}"
cd "$APP_DIR"
if ! /Applications/Ollama.app/Contents/Resources/ollama list >/dev/null 2>&1; then
  open -a Ollama
  for attempt in {1..30}; do
    sleep 1
    /Applications/Ollama.app/Contents/Resources/ollama list >/dev/null 2>&1 && break
  done
fi
exec /usr/bin/python3 "$APP_DIR/server.py" "$@"
