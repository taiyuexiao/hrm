import { defineConfig } from '@playwright/test';

/**
 * 周报系统 E2E 配置
 * 前置：本地前端 5173 + 后端 8080 均在运行
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1,                 // 串行：共享本地 SQLite，避免用例间互相干扰
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',        // 直接用本机 Chrome，无需下载浏览器
    viewport: { width: 1600, height: 950 },
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
