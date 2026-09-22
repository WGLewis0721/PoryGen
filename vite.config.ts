import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Local dev: run `npm --prefix labs/source-search-lab start` for /api/scan.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  optimizeDeps: {
    exclude: ['@porygen/provenance-core'],
  },
})
