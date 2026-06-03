/// <reference types="vite/client" />

declare module '*.json' {
  const value: any;
  export default value;
}

interface ImportMetaEnv {
  /** @deprecated 请使用 VITE_LLM_API_KEY */
  readonly VITE_DEEPSEEK_API_KEY: string;
  /** LLM 服务根地址（默认 https://api.deepseek.com） */
  readonly VITE_LLM_BASE_URL?: string;
  /** LLM API 密钥 */
  readonly VITE_LLM_API_KEY?: string;
  /** LLM 模型名称（默认 deepseek-chat） */
  readonly VITE_LLM_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
