/// <reference types="vite/client" />

declare module '*.json' {
  const value: any;
  export default value;
}

interface ImportMetaEnv {
  // 前端环境变量（如有需要可在此声明）
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
