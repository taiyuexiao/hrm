/**
 * LLM 大模型配置中心
 * ==================
 * 部署到内网服务器时，只需修改此文件（或 .env 环境变量）中的
 * baseUrl / apiKey / model 即可切换为内网 LLM 服务。
 *
 * 优先级：.env 环境变量 > 此文件默认值
 */

export const LLM_CONFIG = {
  /** LLM 服务根地址（需兼容 OpenAI /chat/completions 格式） */
  baseUrl: import.meta.env.VITE_LLM_BASE_URL || 'https://api.deepseek.com',

  /** API 密钥 */
  apiKey: import.meta.env.VITE_LLM_API_KEY || import.meta.env.VITE_DEEPSEEK_API_KEY || '',

  /** 模型名称 */
  model: import.meta.env.VITE_LLM_MODEL || 'deepseek-chat',

  /** 聊天补全接口路径 */
  chatCompletionPath: '/chat/completions',

  /** 完整请求地址 */
  get chatCompletionUrl() {
    return this.baseUrl.replace(/\/$/, '') + this.chatCompletionPath;
  },
} as const;
