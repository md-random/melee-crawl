import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Rules engine tests run as plain TS in node — no Nuxt runtime needed.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
