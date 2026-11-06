import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/settings/branding/background/video': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 3_600_000,
        proxyTimeout: 3_600_000,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
