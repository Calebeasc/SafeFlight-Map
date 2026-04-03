import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health':     { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/control':    { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/targets':    { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/heatmap':    { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/encounters': { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/export':     { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/settings':   { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/route':      { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/stats':      { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/data':       { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/gps':        { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/gps/update': { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/phone-gps':  { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/users':      { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/scan':       { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/devices':    { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/flock':      { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/hotspots':   { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/stoppers':   { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/accounts':   { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/achievements': { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/replay':     { target:'http://127.0.0.1:8742', changeOrigin:true },
      '/ws/gps': {
        target:  'ws://127.0.0.1:8742',
        ws:       true,
        changeOrigin: true,
      },
    }
  },
  build: { outDir:'dist', emptyOutDir:true }
})
