#!/bin/zsh
set -e
echo "正在续传中文财务检索模型（总计约 639 MB，会从上次进度继续）…"
open -a Ollama
for attempt in {1..30}; do
  sleep 1
  /Applications/Ollama.app/Contents/Resources/ollama list >/dev/null 2>&1 && break
done
/Applications/Ollama.app/Contents/Resources/ollama pull qwen3-embedding:0.6b
echo ""
echo "下载完成。下次打开个人财务助理时会自动建立语义索引。"
read "?按回车关闭…"
