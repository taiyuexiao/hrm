#!/bin/bash
# 智能周报系统后端启动脚本
# 要求：本脚本与 intelligent-hr-backend-1.0.0.jar 放在同一目录

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_NAME="intelligent-hr-backend-1.0.0.jar"
JAR_PATH="${APP_DIR}/${JAR_NAME}"
LOG_FILE="${APP_DIR}/backend.log"
PID_FILE="${APP_DIR}/backend.pid"

if [ ! -f "${JAR_PATH}" ]; then
  echo "错误：未找到 ${JAR_PATH}"
  exit 1
fi

# 检查配置文件是否存在
if [ ! -f "${APP_DIR}/config/application.yml" ] && [ ! -f "${APP_DIR}/application.yml" ]; then
  echo "警告：未找到 config/application.yml 或 application.yml，LLM/数据库配置可能为空"
  echo "请从 deploy-package/config/application.yml 复制一份到 ${APP_DIR}/config/ 目录"
fi

# 停止已有进程
if [ -f "${PID_FILE}" ]; then
  OLD_PID=$(cat "${PID_FILE}")
  if ps -p "${OLD_PID}" > /dev/null 2>&1; then
    echo "停止已有进程 ${OLD_PID}"
    kill "${OLD_PID}"
    sleep 2
  fi
  rm -f "${PID_FILE}"
fi

echo "启动后端服务..."
echo "工作目录：${APP_DIR}"
echo "配置文件：${APP_DIR}/config/application.yml"
echo ""
echo "如需覆盖配置，可设置环境变量："
echo "  DATA_DIR=/your/data/dir"
echo "  SERVER_PORT=8080"
echo "  LLM_BASE_URL=http://10.202.32.20:8180/lm/v2"
echo "  LLM_API_KEY=your-key"
echo "  LLM_MODEL=qwen35-35b-a3b-nothink"
echo ""

export DATA_DIR="${APP_DIR}/data"

cd "${APP_DIR}"
nohup java -jar "${JAR_PATH}" > "${LOG_FILE}" 2>&1 &

NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"
echo "后端已启动，PID: ${NEW_PID}"
echo "日志: tail -f ${LOG_FILE}"
