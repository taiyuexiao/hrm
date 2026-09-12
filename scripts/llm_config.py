"""
LLM 大模型配置中心
==================
部署到内网服务器时，只需修改此文件中的
BASE_URL / API_KEY / MODEL 即可切换为内网 LLM 服务。
"""

# LLM 服务根地址（需兼容 OpenAI /chat/completions 格式）
# 上海银行内部大模型网关（多活IP: 10.240.192.142:30003 / 10.240.192.142:30005 / 10.240.192.143:30005）
BASE_URL = "http://10.240.192.142:30003"

# API 密钥
API_KEY = "sk-VTJ7LU7TSrMsyhW3yixyqvhsAD14iwhMTbJiQGHWCjgmct9F"

# 模型名称
# 可选: deepseek-v4 / deepseek-v4-flash / deepseek-v3 / glm51-local / qwen3-32b 等
MODEL = "deepseek-v4"

# 聊天补全接口路径
CHAT_COMPLETION_PATH = "/chat/completions"


def get_chat_completion_url() -> str:
    """返回完整请求地址"""
    return BASE_URL.rstrip("/") + CHAT_COMPLETION_PATH
