import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The isolated lab uses node:test and is run separately by npm test.
    exclude: ['**/node_modules/**', 'labs/source-search-lab/**', 'PoryGen/**'],
  },
})
