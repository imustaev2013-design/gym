import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// На GitHub Pages приложение лежит в подпапке /<repo>/, путь задаёт workflow через VITE_BASE
const base = process.env.VITE_BASE ?? './'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // «prompt»: новая версия ставится тихо при открытии, а если приложение уже в работе — показывается строка «Обновить»
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'splash-light.png', 'splash-dark.png'],
      manifest: {
        name: 'Зал',
        short_name: 'Зал',
        description: 'Учёт тренировок',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
