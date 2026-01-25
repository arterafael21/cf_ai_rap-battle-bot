import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
        ws: true, 
      },
      '/onboarding': 'http://127.0.0.1:8787',
      '/leaderboard': 'http://127.0.0.1:8787',
      '/battle': 'http://127.0.0.1:8787',
      '/profile': 'http://127.0.0.1:8787',
      '/speak': 'http://127.0.0.1:8787',
      '/transcribe': 'http://127.0.0.1:8787',
      '/challenge': 'http://127.0.0.1:8787',
      '/replay': 'http://127.0.0.1:8787',
    }
  }
})