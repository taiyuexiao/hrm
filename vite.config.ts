import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

/** 移除 HTML 中的 crossorigin 属性，避免 Tomcat 等静态服务器未配 CORS 头时资源加载失败 */
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    // 在 legacy 等插件处理完 HTML 后再执行，确保所有 crossorigin 都被移除
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        return html.replace(/ crossorigin(?:="anonymous")?/g, '');
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    removeCrossorigin(),
    legacy({
      // 支持内网低版本 Chrome/Edge 浏览器（如 Chrome 90）
      targets: ['chrome >= 90', 'edge >= 90', 'firefox >= 88', 'safari >= 14'],
      // 为不支持 modern 语法的浏览器生成 legacy chunk
      renderLegacyChunks: true,
      // 注入必要的 polyfills（Promise、fetch、Object.fromEntries 等）
      modernPolyfills: true,
      additionalLegacyTargets: ['defaults', 'not IE 11'],
    })
  ],
  base: './',
  build: {
    assetsDir: 'assets',
    sourcemap: false,
    // legacy 插件需要 terser 压缩
    minify: 'terser'
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
