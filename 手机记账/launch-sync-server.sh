#!/bin/zsh
cd "$(dirname "$0")"
export PORT=4175
export CERT_PORT=4176
exec /usr/bin/python3 sync-server.py
