#!/bin/bash
# 智能周报系统后端停止脚本

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="${APP_DIR}/backend.pid"

if [ -f "${PID_FILE}" ]; then
  PID=$(cat "${PID_FILE}")
  if ps -p "${PID}" > /dev/null 2>&1; then
    echo "停止后端进程 ${PID}"
    kill "${PID}"
    sleep 2
    if ps -p "${PID}" > /dev/null 2>&1; then
      echo "强制停止..."
      kill -9 "${PID}"
    fi
  else
    echo "进程 ${PID} 不存在"
  fi
  rm -f "${PID_FILE}"
else
  echo "未找到 PID 文件，尝试查找并停止 java 进程..."
  pkill -f intelligent-hr-backend-1.0.0.jar || true
fi

echo "后端已停止"
