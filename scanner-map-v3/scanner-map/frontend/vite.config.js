import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health':    'http://127.0.0.1:8742',
      '/control':   'http://127.0.0.1:8742',
      '/targets':   'http://127.0.0.1:8742',
      '/heatmap':   'http://127.0.0.1:8742',
      '/encounters':'http://127.0.0.1:8742',
      '/export':    'http://127.0.0.1:8742',
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
