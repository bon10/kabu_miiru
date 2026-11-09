// 動作確認：サーバーを stdio で起動し、MCP クライアントとして各ツールを呼ぶ。
// 失敗したら 0 以外で終わる。DB は読み取り専用ユーザーで読むだけ。
// 実行: pnpm smoke
import { strict as assert } from 'node:assert'
import { Client } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const client = new Client({ name: 'smoke-test', version: '1.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'node_modules/.bin/tsx',
    args: ['src/main.ts'],
    // 接続先（MCP_DATABASE_URL）は main.ts が stock-portfolio-app/.env から読むので渡さない
    env: getDefaultEnvironment(),
  }),
)

const { tools } = await client.listTools()
assert.deepEqual(
  tools.map((t) => t.name).sort(),
  ['portfolio_get_breakdown', 'portfolio_list_holdings'],
)

const breakdown = await client.callTool({
  name: 'portfolio_get_breakdown',
  arguments: { group_by: 'sector', response_format: 'json' },
})
assert.ok(!breakdown.isError, `breakdown failed: ${JSON.stringify(breakdown.content)}`)
const data = breakdown.structuredContent as {
  groups: { name: string; weight: number }[]
  uninvested_sectors: string[]
}
assert.ok(data.groups.length > 0, 'セクターのグループが 1 つ以上ある')
const weightSum = data.groups.reduce((sum, g) => sum + g.weight, 0)
assert.ok(Math.abs(weightSum - 100) < 0.01, `比率の合計が 100% になる（${weightSum}）`)
assert.ok(Array.isArray(data.uninvested_sectors), '未投資のセクターを返す')

const holdings = await client.callTool({
  name: 'portfolio_list_holdings',
  arguments: { limit: 3, response_format: 'json' },
})
assert.ok(!holdings.isError, `list failed: ${JSON.stringify(holdings.content)}`)
const page = holdings.structuredContent as { holdings: unknown[]; total: number }
assert.equal(page.holdings.length, Math.min(3, page.total))

// 想定外の引数は、モデルが読めるツールエラーとして返る
const invalid = await client.callTool({
  name: 'portfolio_list_holdings',
  arguments: { sector: '自動車' },
})
assert.equal(invalid.isError, true, 'Yahoo の分類に無いセクターは拒否する')

await client.close()
console.error('Smoke test passed')
