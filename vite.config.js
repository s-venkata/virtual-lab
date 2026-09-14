import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: true,
    port: 3000,
    cors: true,
    proxy: {
      '/colyseus': {
        target:      'ws://localhost:3001',
        ws:          true,
        changeOrigin: true,
        rewrite:     path => path.replace(/^\/colyseus/, ''),
      },
      '/api': {
        target:      'http://localhost:3001',
        changeOrigin: true,
        secure:      false,
      },
      '/config.js': {
        target:      'http://localhost:3001',
        changeOrigin: true,
        secure:      false,
      },
    },
  }
})
