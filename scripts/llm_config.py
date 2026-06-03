"""
LLM 大模型配置中心
==================
部署到内网服务器时，只需修改此文件中的
BASE_URL / API_KEY / MODEL 即可切换为内网 LLM 服务。
"""

# LLM 服务根地址（需兼容 OpenAI /chat/completions 格式）
BASE_URL = "https://api.deepseek.com"

# API 密钥
API_KEY = "sk-697c73630edf4fa3b20c15bb7cca09cb"

# 模型名称
MODEL = "deepseek-chat"

# 聊天补全接口路径
CHAT_COMPLETION_PATH = "/chat/completions"


def get_chat_completion_url() -> str:
    """返回完整请求地址"""
    return BASE_URL.rstrip("/") + CHAT_COMPLETION_PATH
