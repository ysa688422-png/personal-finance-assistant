#!/bin/zsh

PROJECT_DIR="${0:A:h}"
LEDGER_DIR="$PROJECT_DIR/手机记账"
LOCK_DIR="/tmp/com.sayi.finance-services.lock"

receiver_pid=0
lock_owned=0

port_ready() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

process_alive() {
  [ "$1" -gt 0 ] && /bin/kill -0 "$1" >/dev/null 2>&1
}

claim_lock() {
  if /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
    return 0
  fi

  local old_pid=""
  # 另一个控制台可能刚创建锁、尚未写入 PID；此时不能当作旧锁清理。
  [ -f "$LOCK_DIR/pid" ] || return 1
  old_pid="$(/bin/cat "$LOCK_DIR/pid" 2>/dev/null)"
  [[ "$old_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  if /bin/kill -0 "$old_pid" >/dev/null 2>&1; then
    return 1
  fi

  # 只清理确认没有存活控制台的旧锁，不碰任何服务进程。
  /bin/rm -f "$LOCK_DIR/pid" 2>/dev/null
  /bin/rmdir "$LOCK_DIR" 2>/dev/null || return 1
  /bin/mkdir "$LOCK_DIR" 2>/dev/null
}

cleanup() {
  trap - EXIT HUP INT TERM
  if process_alive "$receiver_pid"; then
    echo "正在停止本窗口启动的手机记账接收器..."
    /bin/kill "$receiver_pid" >/dev/null 2>&1
  fi
  if [ "$lock_owned" -eq 1 ] && [ "$(/bin/cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
    /bin/rm -f "$LOCK_DIR/pid" 2>/dev/null
    /bin/rmdir "$LOCK_DIR" 2>/dev/null
  fi
}

clear
printf '\033]0;洒一的财务与投资 - 手机记账服务\007'
echo "=================================================="
echo "        洒一的财务与投资 - 手机记账服务"
echo "=================================================="
echo "本窗口只管理手机记账接收器和财务主页面。"
echo "财务助理仅在您主动打开时启动。"
echo

if ! claim_lock; then
  echo "服务控制台已经打开，本窗口不会重复启动服务。"
  read "?按回车键关闭这个重复窗口。"
  exit 0
fi
lock_owned=1
echo "$$" > "$LOCK_DIR/pid"
trap cleanup EXIT
trap 'exit 0' HUP INT TERM

if port_ready 4175 && port_ready 4176; then
  echo "手机记账服务已经运行，继续使用现有进程。"
  echo "关闭本窗口不会停止该服务。"
  read "?按回车键关闭本窗口。"
  exit 0
fi

if port_ready 4175 || port_ready 4176; then
  echo "4175 或 4176 端口已有服务占用，但手机记账服务尚未完整就绪。"
  echo "为避免启动重复进程，本窗口不会自动重试或结束现有服务。"
  read "?请检查现有服务；按回车键关闭本窗口。"
  exit 1
fi

echo "正在启动手机记账接收器和财务主页面..."
(
  cd "$LEDGER_DIR" || exit 1
  export PORT=4175
  export CERT_PORT=4176
  exec /usr/bin/python3 -u sync-server.py
) &
receiver_pid=$!

ready=0
for attempt in {1..40}; do
  if port_ready 4175 && port_ready 4176 && /usr/bin/curl --noproxy '*' -s --fail --max-time 1 "http://localhost:4176/home.html" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! process_alive "$receiver_pid"; then
    break
  fi
  /bin/sleep 0.5
done

if [ "$ready" -ne 1 ]; then
  # 启动失败时立即收回自己创建的进程，避免等待用户按键期间 PID 被复用。
  if process_alive "$receiver_pid"; then
    /bin/kill "$receiver_pid" >/dev/null 2>&1
  fi
  receiver_pid=0
  # 失败提示等待期间也必须释放锁，允许用户手动重新打开。
  cleanup
  echo "启动未成功。不会自动重启，请检查上方错误信息。"
  read "?按回车键关闭本窗口。"
  exit 1
fi

echo
echo "手机记账服务已就绪："
echo "  手机同步接收器  https://本机地址:4175"
echo "  财务主页面      http://localhost:4176/home.html"
echo "关闭本窗口时，只会停止本窗口启动的接收器。"
echo

# 接收器意外退出时结束本控制台，不自动复活，也不启动财务助理。
wait "$receiver_pid"
exit_code=$?
receiver_pid=0
echo "手机记账接收器已退出。"
exit "$exit_code"
