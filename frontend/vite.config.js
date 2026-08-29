import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dashboard uses a configurable base URL (VITE_API_BASE) with CORS by
// default. A dev proxy for /api is also provided as an alternative.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
