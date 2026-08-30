import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 前端构建配置：React + PWA
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 关键：旧 Service Worker 自毁，且不再预缓存任何资源 → 手机打开永远拉最新版
      selfDestroying: true,
      version: Date.now().toString(),
      includeAssets: ['favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '花の手帳',
        short_name: '花の手帳',
        description: '个人生活与交易管理助手',
        theme_color: '#10b981',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // 不预缓存任何资源，避免手机被旧缓存卡死
        globPatterns: [],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 10 }
          }
        ]
      }
    })
  ],
  // Vercel 下 api/ 目录为 serverless 函数，不参与前端打包
  build: {
    outDir: 'dist'
  }
})
