// 株みーるの保有データを読むだけの MCP サーバー（stdio）。起動口は main.ts。
//
// アプリの本番 DB（TiDB）に Prisma で直接つなぐ。接続には読み取り専用の DB
// ユーザー（MCP_DATABASE_URL）を使い、書き込みは DB 側で拒否される（ADR 0018）。
// USD/JPY レートも Yahoo から取り直して保存はせず、保存済みの最新値を使う。
//
// 評価額・損益の計算はアプリの保有一覧と同じ loadHoldingRows を使う。
// 現在価格・評価損益・評価損益率は、最後に価格更新した時点の保存値である
// （docs/1-requirements/price-update.md「価格更新をしないと変わらない数値」）。
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'
import { getLatestStoredUsdJpyRate } from '@/lib/exchange-rate'
import { formatDateKey } from '@/lib/date-key'
import { loadHoldingRows, type HoldingRow } from '@/lib/holdings'
import { UNSET_SECTOR, matchesHoldingFilter } from '@/lib/holdings-filter'
import {
  UNSET_GROUP_NAME,
  breakdownHoldings,
  uninvestedSectors,
  type BreakdownGroup,
} from '@/lib/portfolio-breakdown'
import { ETF_SECTOR, YAHOO_SECTORS } from '@/lib/sector'
import { formatCurrency, formatPercentage, formatPrice } from '@/lib/utils'

const CHARACTER_LIMIT = 25_000

const ResponseFormat = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe("'markdown' は読みやすい表、'json' は構造化データ")

const SECTOR_VALUES = [...YAHOO_SECTORS, ETF_SECTOR, UNSET_GROUP_NAME] as const

// パーセントの値（-6.59 など）を表示用に整える
const percent = (value: number) => formatPercentage(value / 100)

// DB に届かないときに、どこを直せばよいかを伝える
async function loadRows(): Promise<{
  rows: HoldingRow[]
  usdJpyRate: number
  rateDate: string
}> {
  try {
    const { rate, rateDate } = await getLatestStoredUsdJpyRate()
    const { rows } = await loadHoldingRows({ usdJpyRate: rate })
    return { rows, usdJpyRate: rate, rateDate: formatDateKey(rateDate) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `保有データを DB から読めませんでした（${reason}）。stock-portfolio-app/.env の MCP_DATABASE_URL と、読み取り専用ユーザーに SELECT 権限があるか、DB に接続できるネットワークかを確認してください。`,
    )
  }
}

// 価格の鮮度。保存値なので、古ければ価格更新を促す
function priceFreshness(rows: HoldingRow[]): string {
  const times = rows
    .map((r) => r.lastPriceUpdate?.getTime())
    .filter((t): t is number => t !== undefined)
  if (times.length === 0) return '価格の最終更新: 不明'
  const fmt = (t: number) =>
    new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  return `価格の最終更新: ${fmt(Math.min(...times))} 〜 ${fmt(Math.max(...times))}（JST）。古い場合はアプリのヘッダーの「価格更新」を押すと最新になる`
}

function groupTable(groups: BreakdownGroup[], total: BreakdownGroup): string {
  const lines = [
    '| 区分 | 銘柄数 | 評価額 | 比率 | 投資額 | 評価損益 | 損益率 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const g of [...groups, total]) {
    lines.push(
      `| ${g.name} | ${g.stockCount} | ${formatCurrency(g.currentValue)} | ${percent(g.weight)} | ${formatCurrency(g.investmentAmount)} | ${formatCurrency(g.profitLoss)} | ${percent(g.profitLossRate)} |`,
    )
  }
  return lines.join('\n')
}

const SORT_KEYS = {
  currentValue: (r: HoldingRow) => r.currentValue,
  investmentAmount: (r: HoldingRow) => r.investmentAmount,
  profitLoss: (r: HoldingRow) => r.profitLoss,
  profitLossRate: (r: HoldingRow) => r.profitLossRate,
} as const

function createServer(): McpServer {
  const server = new McpServer({ name: 'kabu-miiru-mcp-server', version: '0.1.0' })

  server.registerTool(
    'portfolio_get_breakdown',
    {
      title: '保有の構成（分野別など）',
      description: `保有株をセクター・市場・証券会社のどれかでまとめ、評価額・比率・投資額・評価損益・損益率を返す。
group_by="sector" のときは、Yahoo Finance の 11 分類のうちまだ 1 銘柄も持っていないセクター（未投資の分野）も返す。

セクターは Yahoo Finance の分類（GICS ではない）。ETF は「ETF」、セクター未入力の銘柄は「未設定」にまとまる。
金額はすべて円。米国株は当日の USD/JPY で換算している。
現在価格と評価損益は最後に価格更新した時点の値。

使い方の例:
  - 「分野ごとの偏りを見たい」「持っていない分野は？」 -> group_by="sector"
  - 「日本株と米国株の比率は？」 -> group_by="market"
  - 「米国株だけの分野構成は？」 -> group_by="sector", market="米国"
個々の銘柄を見たいときは portfolio_list_holdings を使う。`,
      inputSchema: z.strictObject({
        group_by: z
          .enum(['sector', 'market', 'broker'])
          .default('sector')
          .describe("まとめ方。'sector'=セクター、'market'=市場（国内/米国）、'broker'=証券会社"),
        market: z
          .enum(['国内', '米国'])
          .optional()
          .describe('指定した市場の銘柄だけでまとめる。省略すると全銘柄'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ group_by, market, response_format }) => {
      const { rows: allRows, usdJpyRate, rateDate } = await loadRows()
      const rows = allRows.filter((r) => matchesHoldingFilter(r, { market }))
      if (rows.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: market
                ? `${market}の保有銘柄がありません。market を省略すると全銘柄でまとめます。`
                : '保有銘柄がありません。',
            },
          ],
        }
      }

      const { groups, total } = breakdownHoldings(rows, group_by)
      const uninvested = group_by === 'sector' ? uninvestedSectors(rows) : undefined
      const data = {
        group_by,
        market: market ?? null,
        usd_jpy_rate: usdJpyRate,
        usd_jpy_rate_date: rateDate,
        groups,
        total,
        ...(uninvested ? { uninvested_sectors: uninvested } : {}),
      }

      if (response_format === 'json') {
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        }
      }

      const label = { sector: 'セクター', market: '市場', broker: '証券会社' }[group_by]
      const lines = [
        `# ${label}別の構成${market ? `（${market}のみ）` : ''}`,
        '',
        groupTable(groups, total),
      ]
      if (uninvested) {
        lines.push(
          '',
          '## 未投資のセクター',
          uninvested.length > 0
            ? uninvested.map((s) => `- ${s}`).join('\n')
            : 'Yahoo の 11 分類すべてに 1 銘柄以上を保有している。',
        )
      }
      lines.push('', `USD/JPY: ${usdJpyRate}（${rateDate} のレート）`, priceFreshness(rows))
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  )

  server.registerTool(
    'portfolio_list_holdings',
    {
      title: '保有銘柄の一覧',
      description: `保有株を 1 銘柄 1 行で返す。銘柄名・コード・証券会社・市場・セクター・保有株数・平均取得単価・現在価格・投資額・評価額・評価損益・損益率・ポートフォリオ全体に占める比率。

市場・セクターで絞り込める。比率は絞り込みに関係なく、保有全体の評価額に対する割合。
単価（平均取得・現在価格）は建値通貨（米国株はドル）、金額は円（米国株は当日の USD/JPY で換算）。
現在価格と評価損益は最後に価格更新した時点の値。

使い方の例:
  - 「Technology の銘柄は？」 -> sector="Technology"
  - 「含み損の大きい順に」 -> sort_by="profitLoss", order="asc"
分野ごとの合計や未投資の分野を見たいときは portfolio_get_breakdown を使う。`,
      inputSchema: z.strictObject({
        market: z.enum(['国内', '米国']).optional().describe('市場で絞り込む'),
        sector: z
          .enum(SECTOR_VALUES)
          .optional()
          .describe('セクターで絞り込む。Yahoo の 11 分類、ETF、または「未設定」'),
        sort_by: z
          .enum(['currentValue', 'investmentAmount', 'profitLoss', 'profitLossRate'])
          .default('currentValue')
          .describe('並べ替えの基準。評価額・投資額・評価損益・損益率'),
        order: z.enum(['desc', 'asc']).default('desc').describe("'desc'=大きい順、'asc'=小さい順"),
        limit: z.number().int().min(1).max(200).default(50).describe('返す銘柄数の上限'),
        offset: z.number().int().min(0).default(0).describe('読み飛ばす銘柄数（続きを取るとき）'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ market, sector, sort_by, order, limit, offset, response_format }) => {
      const { rows: allRows } = await loadRows()
      const totalValue = allRows.reduce((sum, r) => sum + r.currentValue, 0)

      const filter = {
        market,
        sector: sector === UNSET_GROUP_NAME ? UNSET_SECTOR : sector,
      }
      const sign = order === 'asc' ? 1 : -1
      const matched = allRows
        .filter((r) => matchesHoldingFilter(r, filter))
        .sort((a, b) => (SORT_KEYS[sort_by](a) - SORT_KEYS[sort_by](b)) * sign)

      if (matched.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '条件に合う保有銘柄がありません。portfolio_get_breakdown で、どのセクター・市場に銘柄があるかを確認してください。',
            },
          ],
        }
      }

      const toItem = (r: HoldingRow) => ({
        stock_name: r.stockName,
        code: r.code,
        broker: r.brokerName,
        market: r.market,
        sector: r.marketSector,
        shares_held: r.sharesHeld,
        avg_acquisition_price: r.avgAcquisitionPrice,
        current_price: r.currentPrice,
        price_currency: r.market === '米国' ? 'USD' : 'JPY',
        investment_amount_jpy: r.investmentAmount,
        current_value_jpy: r.currentValue,
        profit_loss_jpy: r.profitLoss,
        profit_loss_rate_percent: r.profitLossRate,
        weight_percent: totalValue > 0 ? (r.currentValue / totalValue) * 100 : 0,
        price_update_failed: r.priceUpdateStatus === 'ERROR',
      })

      // CHARACTER_LIMIT を超えるときは、本文を切らずに返す銘柄数を減らす
      const render = (items: HoldingRow[]) => {
        const nextOffset = offset + items.length
        const hasMore = matched.length > nextOffset
        const page = {
          total: matched.length,
          count: items.length,
          offset,
          holdings: items.map(toItem),
          has_more: hasMore,
          ...(hasMore ? { next_offset: nextOffset } : {}),
        }
        if (response_format === 'json') return { page, text: JSON.stringify(page, null, 2) }

        const lines = [
          `# 保有銘柄（${matched.length} 件中 ${offset + 1}〜${nextOffset} 件目）`,
          '',
          '| 銘柄 | 証券会社 | 市場 | セクター | 株数 | 平均取得 | 現在価格 | 投資額 | 評価額 | 評価損益 | 損益率 | 比率 |',
          '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ]
        for (const r of items) {
          const item = toItem(r)
          lines.push(
            `| ${r.stockName}（${r.code}）${item.price_update_failed ? ' ⚠価格更新失敗' : ''} | ${r.brokerName} | ${r.market} | ${r.marketSector ?? '-'} | ${r.sharesHeld} | ${formatPrice(r.avgAcquisitionPrice, r.market)} | ${formatPrice(r.currentPrice, r.market)} | ${formatCurrency(r.investmentAmount)} | ${formatCurrency(r.currentValue)} | ${formatCurrency(r.profitLoss)} | ${percent(r.profitLossRate)} | ${percent(item.weight_percent)} |`,
          )
        }
        if (hasMore) lines.push('', `続きがあります: offset=${nextOffset} で再度呼んでください。`)
        lines.push('', priceFreshness(items))
        return { page, text: lines.join('\n') }
      }

      let items = matched.slice(offset, offset + limit)
      let result = render(items)
      while (items.length > 1 && result.text.length > CHARACTER_LIMIT) {
        items = items.slice(0, Math.ceil(items.length / 2))
        result = render(items)
      }

      if (items.length === 0) {
        return {
          content: [
            { type: 'text', text: `offset=${offset} は件数（${matched.length} 件）を超えています。offset=0 から取り直してください。` },
          ],
        }
      }
      if (response_format === 'json') {
        return { content: [{ type: 'text', text: result.text }], structuredContent: result.page }
      }
      return { content: [{ type: 'text', text: result.text }] }
    },
  )

  return server
}

serveStdio(createServer)
console.error('kabu-miiru-mcp-server running on stdio') // stdout は MCP のやりとりに使うので stderr に出す
