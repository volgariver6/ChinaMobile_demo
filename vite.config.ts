import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// MOI API Key - 在代理层直接注入，避免浏览器 CORS 问题
const MOI_API_KEY = 'izzk2HYoLc1XhoXPkOP4iL5H6ZBvgnCCvFDifnglwKRSmVYj-QD8KeLQ9Chpq9baAtJjW9WCJimFtF-c'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // MOI 数据库 API 代理
      '/moi-api': {
        target: 'https://freetier-01.cn-hangzhou.cluster.cn-dev.matrixone.tech',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/moi-api/, ''),
        secure: false,
        // 在代理层注入 API Key，避免浏览器发送自定义 header 导致的 CORS 预检请求
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 直接在代理层注入 moi-key
            proxyReq.setHeader('moi-key', MOI_API_KEY)
            console.log('[Proxy]', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('[Proxy Response]', proxyRes.statusCode, req.url)
          })
          proxy.on('error', (err, req) => {
            console.error('[Proxy Error]', err.message, req.url)
          })
        }
      }
    }
  }
})

