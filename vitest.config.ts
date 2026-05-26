import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@alyldas/uniauth-oauth-oidc-provider',
        replacement: new URL('./src/index.ts', import.meta.url).pathname,
      },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
