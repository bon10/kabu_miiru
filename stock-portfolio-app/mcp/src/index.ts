// 株みーるの保有データを読むだけの MCP サーバー（stdio）。起動口は main.ts。
//
// アプリの本番 DB（TiDB）に Prisma で直接つなぐ。接続には読み取り専用の DB
// ユーザー（MCP_DATABASE_URL）を使い、書き込みは DB 側で拒否される（ADR 0018）。
// USD/JPY レートも Yahoo から取り直して保存はせず、保存済みの最新値を使う。
// 銘柄の財務指標（stock_get_fundamentals）だけは、銘柄選びのスキルとアプリの値を
// 揃えるため、アプリと同じコードで Yahoo から取る。取った値は保存しない（ADR 0020）。
//
// 評価額・損益の計算はアプリの保有一覧と同じ loadHoldingRows を使う。
// 現在価格・評価損益・評価損益率は、最後に価格更新した時点の保存値である
// （docs/1-requirements/price-update.md「価格更新をしないと変わらない数値」）。
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'
import { getLatestStoredUsdJpyRate } from '@/lib/exchange-rate'
import { formatDateKey } from '@/lib/date-key'
import { loadFundamentalChecks, type FundamentalCheckRow } from '@/lib/fundamental-store'
import { fetchStockFundamentals, type StockFundamentals } from '@/lib/fundamentals'
import { loadHoldingRows, type HoldingRow } from '@/lib/holdings'
import { UNSET_SECTOR, matchesHoldingFilter } from '@/lib/holdings-filter'
import {
  UNSET_GROUP_NAME,
  breakdownHoldings,
  uninvestedSectors,
  type BreakdownGroup,
} from '@/lib/portfolio-breakdown'
import { ETF_SECTOR, YAHOO_SECTORS } from '@/lib/sector'
import {
  FUNDAMENTAL_CHECK_START_NOTE,
  FUNDAMENTAL_CHECK_NOTE_TEXT,
  formatCurrency,
  formatPercentage,
  formatPrice,
} from '@/lib/utils'

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
function priceFreshness(rows: { lastPriceUpdate: Date | null }[]): string {
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

  server.registerTool(
    'stock_get_fundamentals',
    {
      title: '銘柄の財務指標と株価の安値・200日線',
      description: `銘柄コードを渡すと、Yahoo Finance から財務の値と株価の履歴を取り、次を返す。保有していない銘柄も調べられる。
  - 現在値（最新の終値）、年初来安値・52週安値（終値ベース）と、そこから何 % 上にいるか、200日線
  - ROE、FCF利回り、自己資本比率、有利子負債倍率（D/E）、Altman Z（元の式）

財務の値は直近の通期決算（基準期）のもの。項目ごとに最新期がずれていても、基準期以外の値は混ぜない（欠けた項目を使う指標は null）。
時価総額は 現在値 × 基準期末の株式数。財務と株価の通貨が違う銘柄（ADR など）は、時価総額を使う FCF利回りと Altman Z を返さない。
アプリが保有銘柄の基準割れを判定するときと同じ計算を使う。

使い方の例:
  - 銘柄選びで候補の指標を確かめる -> codes=["8058", "JNJ"]
日本株は数字のコード（"7203"）、米国株はティッカー（"AAPL"）で渡す。`,
      inputSchema: z.strictObject({
        codes: z
          .array(z.string().regex(/^[0-9A-Za-z.\-]{1,10}$/))
          .min(1)
          .max(20)
          .describe('銘柄コード。日本株は数字（"7203"）、米国株はティッカー（"AAPL"）'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ codes, response_format }) => {
      // Yahoo のレート制限を避けるため、価格更新と同じく 1 銘柄ずつ直列で取る
      const items = []
      for (const code of codes) {
        try {
          items.push(toFundamentalsItem(await fetchStockFundamentals(code.toUpperCase())))
        } catch (error) {
          items.push({ code, error: error instanceof Error ? error.message : String(error) })
        }
      }

      if (response_format === 'json') {
        const data = { items }
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        }
      }

      const fmt = (value: number | null, digits = 1) => (value === null ? '-' : value.toFixed(digits))
      const pct = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`)
      const lines = [
        '# 財務指標と株価',
        '',
        '| コード | 現在値（日付） | 年初来安値（+%） | 52週安値（+%） | 200日線 | ROE | FCF利回り | 自己資本比率 | 有利子負債倍率 | Altman Z | 基準期 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
      ]
      const notes: string[] = []
      for (const item of items) {
        if ('error' in item) {
          lines.push(`| ${item.code} | 取得失敗：${item.error} | | | | | | | | | |`)
          continue
        }
        const money = (value: number | null) => (value === null ? '-' : formatMoneyIn(value, item.price_currency))
        lines.push(
          `| ${item.code} | ${money(item.price)}（${item.price_date}） | ${money(item.year_to_date_low)}（+${fmt(item.above_year_to_date_low_percent)}%） | ${money(item.low_52_week)}（+${fmt(item.above_low_52_week_percent)}%） | ${money(item.moving_average_200)} | ${pct(item.roe_percent)} | ${pct(item.fcf_yield_percent)} | ${pct(item.equity_ratio_percent)} | ${pct(item.debt_to_equity_percent)} | ${fmt(item.altman_z, 2)} | ${item.fiscal_period_end ?? '-'} |`,
        )
        if (!item.fiscal_period_end) notes.push(`${item.code}: 財務の値が取れなかった`)
        if (item.negative_equity) notes.push(`${item.code}: 自己資本がマイナス（ROE と有利子負債倍率は計算しない）`)
        if (item.financial_currency && item.financial_currency !== item.price_currency) {
          notes.push(`${item.code}: 財務（${item.financial_currency}）と株価（${item.price_currency}）の通貨が違うため、FCF利回りと Altman Z は計算しない`)
        }
      }
      if (notes.length > 0) lines.push('', '## 注意', ...notes.map((n) => `- ${n}`))
      lines.push('', '出典: Yahoo Finance（非公式 API）。安値は終値ベースで、場中の安値は含まない。')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  )

  server.registerTool(
    'portfolio_check_fundamentals',
    {
      title: '保有銘柄の基準チェック',
      description: `保有銘柄が、銘柄選びのスキル（value-stock-screener）と同じ基準を今も満たしているかを返す。アプリの銘柄詳細「基準チェック」と同じ判定。
基準は固定：ROE 8%以上、FCF利回り 3%以上、財務の安全性（国内株は自己資本比率 40%以上かつ有利子負債倍率 100%以下、米国株は Altman Z 1.8以上）、現在値が200日線より上。

銘柄ごとの判定（status）:
  - broken：買ったときは満たしていた基準を、今は下回っている項目がある（基準割れ。売りを検討するサイン）
  - unmet：買ったときから基準に届いていない項目がある（買ったあとに悪くなったものは無い）
  - ok：すべて満たしている
  - no_data：財務の値がまだ無い（アプリで価格更新をすると取得する）
  - not_applicable：ETF（対象外）
項目ごとに、今の値・購入時の値・判定を返す。比率はパーセントの値、200日線は「200日線から何 % 上か」。

あわせて売りの判定（sell）を返す。これは ADR 0023 のルールで、基準チェック（上の status）とは比べる相手が違う。基準チェックは購入時と比べるが、売りの判定は前の通期決算と比べる。
使う指標は通期決算だけで動く ROE・自己資本比率・有利子負債倍率（米国株は ROE・有利子負債倍率）。FCF利回り・Altman Z・200日線は株価でも動くので使わない（保有銘柄が値上がりすると FCF利回りが基準を割るため）。
  - consider_sell：前の期より悪化して基準を下回った状態が 2 期続いている（売りを検討する）
  - first_period：その 1 期目（まだ様子を見る）
  - ok：引き金なし。基準を下回っていても前の期より良くなっていれば、ここに入る
  - no_data：比べる前の期が無い、または値が無い
  - not_applicable：ETF（対象外）

今の値は、最後に価格更新した時点の株価と、保存済みの財務の値（直近の通期決算）から計算する。DB を読むだけで Yahoo には問い合わせない。
売買を勧めるものではない。基準割れや売りを検討の銘柄をまとめるときも、判断材料として伝える。

使い方の例:
  - 「基準割れの銘柄をまとめて」 -> status="broken"
  - 「基準チェックの結果を全部見せて」 -> status 省略`,
      inputSchema: z.strictObject({
        status: z
          .enum(['broken', 'unmet', 'ok', 'no_data', 'not_applicable'])
          .optional()
          .describe('この判定の銘柄だけ返す。省略すると全銘柄'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, response_format }) => {
      let rows: FundamentalCheckRow[]
      try {
        rows = await loadFundamentalChecks()
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `基準チェックを DB から読めませんでした（${reason}）。読み取り専用ユーザーに StockFundamental・FundamentalSnapshot・DailyPrice の SELECT 権限があるかを確認してください（mcp/README.md）。`,
        )
      }
      const counts = Object.fromEntries(
        (['broken', 'unmet', 'ok', 'no_data', 'not_applicable'] as const).map((s) => [
          s,
          rows.filter((r) => r.check.status === s).length,
        ]),
      )
      const sellCounts = Object.fromEntries(
        (['consider_sell', 'first_period', 'ok', 'no_data', 'not_applicable'] as const).map((s) => [
          s,
          rows.filter((r) => r.sell.status === s).length,
        ]),
      )
      const matched = status ? rows.filter((r) => r.check.status === status) : rows

      const toItem = (r: FundamentalCheckRow) => ({
        stock_name: r.stockName,
        code: r.code,
        market: r.market,
        sector: r.marketSector,
        status: r.check.status,
        items: r.check.items.map((i) => ({
          key: i.key,
          label: i.label,
          threshold: i.thresholdLabel,
          current: i.current,
          purchase: i.purchase,
          status: i.status,
        })),
        notes: r.check.notes.map((n) => FUNDAMENTAL_CHECK_NOTE_TEXT[n]),
        sell: {
          status: r.sell.status,
          items: r.sell.items.map((i) => ({
            key: i.key,
            label: i.label,
            threshold: i.thresholdLabel,
            latest: i.latest,
            previous: i.previous,
            status: i.status,
            first_period_end: i.firstPeriodEnd,
          })),
        },
        purchase_values_recorded_on: r.snapshot ? formatDateKey(r.snapshot.recordedOn) : null,
        purchase_values_are_check_start: r.snapshot?.isCheckStart ?? false,
        fiscal_period_end: r.fiscalPeriodEnd ? formatDateKey(r.fiscalPeriodEnd) : null,
        last_price_update: r.lastPriceUpdate?.toISOString() ?? null,
      })

      if (response_format === 'json') {
        const data = { counts, sell_counts: sellCounts, stocks: matched.map(toItem) }
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        }
      }

      const STATUS_LABEL = {
        broken: '基準割れ',
        unmet: '購入時から未達',
        ok: '満たしている',
        no_data: 'データなし',
        not_applicable: '対象外（ETF）',
      } as const
      const ITEM_LABEL = {
        ok: '○',
        broken: '基準割れ',
        unmet_since_purchase: '購入時から未達',
        no_data: 'データなし',
      } as const
      // 売りの判定（ADR 0023）。基準チェックとは比べる相手が違う
      const SELL_STATUS_LABEL = {
        consider_sell: '売りを検討',
        first_period: '1 期目',
        ok: '引き金なし',
        no_data: '判定できない',
        not_applicable: '対象外（ETF）',
      } as const
      const SELL_ITEM_LABEL = {
        ok: '○',
        first_period: '1 期目',
        consider_sell: '2 期続いている',
        no_data: 'データなし',
      } as const
      const fmt = (key: string, v: number | null) =>
        v === null ? '-' : key === 'altmanZ' ? v.toFixed(2) : `${key === 'trend' && v >= 0 ? '+' : ''}${v.toFixed(1)}%`

      const lines = [
        '# 保有銘柄の基準チェック',
        '',
        `基準割れ ${counts.broken} / 購入時から未達 ${counts.unmet} / 満たしている ${counts.ok} / データなし ${counts.no_data} / 対象外 ${counts.not_applicable}`,
        '',
        `売りの判定（前の期と比べる）：売りを検討 ${sellCounts.consider_sell} / 1 期目 ${sellCounts.first_period} / 引き金なし ${sellCounts.ok} / 判定できない ${sellCounts.no_data} / 対象外 ${sellCounts.not_applicable}`,
      ]
      if (matched.length === 0) lines.push('', '条件に合う銘柄はありません。')
      for (const r of matched) {
        lines.push('', `## ${r.stockName}（${r.code}・${r.market}・${r.marketSector ?? 'セクター未設定'}）：${STATUS_LABEL[r.check.status]}`)
        if (r.check.items.length > 0) {
          lines.push('| 項目 | 基準 | 今 | 購入時 | 判定 |', '| --- | --- | ---: | ---: | --- |')
          for (const i of r.check.items) {
            lines.push(`| ${i.label} | ${i.thresholdLabel} | ${fmt(i.key, i.current)} | ${fmt(i.key, i.purchase)} | ${ITEM_LABEL[i.status]} |`)
          }
        }
        if (r.snapshot) {
          lines.push(
            `購入時の値：${formatDateKey(r.snapshot.recordedOn)} 時点${r.snapshot.isCheckStart ? `（${FUNDAMENTAL_CHECK_START_NOTE}）` : ''}`,
          )
        }
        for (const n of r.check.notes) lines.push(`注：${FUNDAMENTAL_CHECK_NOTE_TEXT[n]}`)
        lines.push(`売りの判定：${SELL_STATUS_LABEL[r.sell.status]}`)
        // 引き金が付いた銘柄だけ、どの項目がいつから続いているかを出す
        if (r.sell.status === 'first_period' || r.sell.status === 'consider_sell') {
          lines.push('| 項目 | 基準 | 直近期 | 前の期 | 判定 | 1 期目 |', '| --- | --- | ---: | ---: | --- | --- |')
          for (const i of r.sell.items) {
            lines.push(`| ${i.label} | ${i.thresholdLabel} | ${fmt(i.key, i.latest)} | ${fmt(i.key, i.previous)} | ${SELL_ITEM_LABEL[i.status]} | ${i.firstPeriodEnd ?? '-'} |`)
          }
        }
      }
      lines.push(
        '',
        '今の値は最後に価格更新した時点の株価と、直近の通期決算から計算している。売買を勧めるものではない。',
        '売りの判定は前の通期決算と比べたもの（ADR 0023）。基準チェックの「基準割れ」は購入時と比べたもので、別の判定。',
        priceFreshness(matched),
      )
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  )

  return server
}

function formatMoneyIn(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return value.toFixed(2) // 通貨コードが取れなかったとき
  }
}

// 安値から何 % 上にいるか（安値ちょうどなら 0）
const aboveLowPercent = (price: number, low: number | null) =>
  low === null || low <= 0 ? null : (price / low - 1) * 100

function toFundamentalsItem(f: StockFundamentals) {
  const { priceStats: s, annual: a, indicators: i } = f
  return {
    code: f.code,
    price: f.price,
    price_currency: f.priceCurrency,
    price_date: formatDateKey(f.priceDate),
    year_to_date_low: s.yearToDateLow,
    above_year_to_date_low_percent: aboveLowPercent(f.price, s.yearToDateLow),
    low_52_week: s.low52Week,
    above_low_52_week_percent: aboveLowPercent(f.price, s.low52Week),
    moving_average_200: s.movingAverage200,
    fiscal_period_end: a?.fiscalPeriodEnd ?? null,
    financial_currency: a?.currency ?? null,
    roe_percent: i?.roe ?? null,
    fcf_yield_percent: i?.fcfYield ?? null,
    equity_ratio_percent: i?.equityRatio ?? null,
    debt_to_equity_percent: i?.debtToEquity ?? null,
    altman_z: i?.altmanZ ?? null,
    market_cap: i?.marketCap ?? null,
    negative_equity: i?.negativeEquity ?? false,
  }
}

serveStdio(createServer)
console.error('kabu-miiru-mcp-server running on stdio') // stdout は MCP のやりとりに使うので stderr に出す
