#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
if [[ "$SCRIPT_DIR" == *.app/Contents/MacOS ]]; then
  PROJECT_DIR="${SAYI_PROJECT_DIR:-${SCRIPT_DIR:h:h:h:h}}"
else
  PROJECT_DIR="${SAYI_PROJECT_DIR:-${SCRIPT_DIR:h}}"
fi
CONTROL_LAUNCHER="$PROJECT_DIR/启动洒一财务与投资服务.command"
CONTROL_LOCK="/tmp/com.sayi.finance-services.lock"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
APP_URL="http://localhost:4176/home.html"

if ! /usr/sbin/lsof -nP -iTCP:4175 -sTCP:LISTEN >/dev/null 2>&1 \
  || ! /usr/sbin/lsof -nP -iTCP:4176 -sTCP:LISTEN >/dev/null 2>&1; then
  control_pid="$(/bin/cat "$CONTROL_LOCK/pid" 2>/dev/null)"
  if [ -z "$control_pid" ] || ! /bin/kill -0 "$control_pid" >/dev/null 2>&1; then
    /usr/bin/open -a Terminal "$CONTROL_LAUNCHER"
  fi
fi

for attempt in {1..60}; do
  if /usr/sbin/lsof -nP -iTCP:4175 -sTCP:LISTEN >/dev/null 2>&1 \
    && /usr/sbin/lsof -nP -iTCP:4176 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  /bin/sleep 0.5
done

if /usr/bin/curl --noproxy '*' -s --fail --max-time 1 "$APP_URL" >/dev/null 2>&1; then
  if [ -x "$CHROME_BIN" ]; then
    "$CHROME_BIN" --autoplay-policy=no-user-gesture-required --app="$APP_URL" >/dev/null 2>&1 &
  else
    /usr/bin/open "$APP_URL"
  fi
else
  /usr/bin/osascript -e 'display alert "手机记账服务未能启动" message "请查看服务控制台的提示，修复后再打开财务主页面。" as warning' >/dev/null 2>&1
fi

exit 0
