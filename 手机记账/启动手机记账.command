#!/bin/zsh
cd "$(dirname "$0")"
clear
echo "正在启动手机记账 HTTPS 同步接收器..."
echo
export PORT=4175
if command -v python3 >/dev/null 2>&1; then
  python3 sync-server.py
elif [ -x /usr/bin/python3 ]; then
  /usr/bin/python3 sync-server.py
else
  echo "没有找到 Python，无法启动。"
  echo "请先安装 macOS Command Line Tools，或联系我改成其他启动方式。"
fi
echo
echo "窗口不要关闭。关闭窗口后，手机就不能同步到电脑。"
read "?按回车键关闭窗口。"
