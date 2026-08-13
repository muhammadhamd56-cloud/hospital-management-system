import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // NestJS backend (backend/api/) — Google OAuth + JWT.
      // The old Express backend (backend/legacy-express/) still runs on :4000
      // but the frontend no longer talks to it; see
      // frontend/DOCTOR_PROFILE_FEATURE.md and backend/api/README.md for the
      // migration status.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
