// MCP サーバーの起動口。DB の接続先を読み取り専用ユーザーに差し替えてから、
// サーバー本体（index.ts）を読み込む（ADR 0018）。
//
// アプリの .env の DATABASE_URL は読み書きできるユーザーなので、MCP では使わない。
// 代わりに同じ .env の MCP_DATABASE_URL（SELECT 権限だけのユーザー）を
// DATABASE_URL に入れる。Prisma Client は、すでに環境変数にある DATABASE_URL を
// .env の値で上書きしない。
// MCP_DATABASE_URL が無いときは起動しない。DATABASE_URL に黙って戻ると、
// 読み書きできるユーザーで動いてしまうため。
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

const readOnlyUrl = process.env.MCP_DATABASE_URL
if (!readOnlyUrl) {
  console.error(
    'MCP_DATABASE_URL が設定されていません。読み取り専用の DB ユーザーの接続文字列を stock-portfolio-app/.env に設定してください（mcp/README.md）。',
  )
  process.exit(1)
}
process.env.DATABASE_URL = readOnlyUrl

await import('./index.js')
