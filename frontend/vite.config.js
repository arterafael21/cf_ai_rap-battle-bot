import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/onboarding': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
      '/leaderboard': 'http://localhost:8787',
      '/battle': 'http://localhost:8787',
      '/profile': 'http://localhost:8787',
      '/speak': 'http://localhost:8787',
      '/transcribe': 'http://localhost:8787',
      '/challenge': 'http://localhost:8787',
    }
  }
})
