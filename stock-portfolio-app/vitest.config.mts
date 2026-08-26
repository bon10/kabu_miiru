import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 単体テスト（純粋ロジック）向けの最小構成。DOM は使わないため environment は node。
// アプリと同じ `@/` エイリアスを解決できるようにし、テストから `@/lib/...` を import 可能にする。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
