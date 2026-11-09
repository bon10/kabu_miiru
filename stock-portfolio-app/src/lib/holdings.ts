import { prisma } from '@/lib/prisma'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpy, toJpyByCurrency } from '@/lib/currency'
import { netDividendAmount, toNullableNumber } from '@/lib/dividend'
import { dateKeyOf, dateKeyParts, toDateKey } from '@/lib/date-key'

// 保有銘柄を 1 銘柄 1 行で読み出す。保有一覧 API（/api/holdings/by-broker）と
// MCP サーバー（mcp/）が共用する。評価額・損益の計算を 1 か所に保つため。
// ドメイン用語は docs/2-domain/ubiquitous-language.md を参照。
//
// 金額（投資額・評価額・損益・年初来配当）は円ベース。米国株は当日の USD/JPY
// レートで円換算する（ADR 0005）。単価（平均取得・現在価格）はドル建てのまま返す。
// 現在価格・評価損益・評価損益率は Stock に保存済みの値で、ここでは取得し直さない。

export interface HoldingRow {
  id: number
  stockName: string
  code: string
  brokerName: string
  market: string
  marketSector: string | null
  sharesHeld: number
  avgAcquisitionPrice: number
  investmentAmount: number
  currentPrice: number
  currentValue: number
  profitLoss: number
  profitLossRate: number
  ytdDividend: number
  priceUpdateStatus: string
  priceUpdateError: string | null
  lastPriceUpdate: Date | null
}

// usdJpyRate を渡すとそのレートで換算する。省略すると getCurrentUsdJpyRate で
// 当日のレートを得る（当日分が DB に無ければ Yahoo から取得して保存する）。
// DB に書けない読み取り専用の呼び出し元（MCP サーバー）は、保存済みのレートを渡す。
export async function loadHoldingRows(
  options: { includeZero?: boolean; usdJpyRate?: number } = {},
): Promise<{ rows: HoldingRow[]; usdJpyRate: number }> {
  // 配当合計はカレンダー年で集計する（ADR 0004）。年の境目は JST で判定する（ADR 0012）
  const yearStart = dateKeyOf(dateKeyParts(toDateKey(new Date())).year, 0, 1)

  const [stocks, dividends, usdJpyRate] = await Promise.all([
    prisma.stock.findMany({
      where: options.includeZero ? {} : { sharesHeld: { gt: 0 } },
      orderBy: { stockName: 'asc' },
    }),
    prisma.dividendHistory.findMany({
      where: { paymentDate: { gte: yearStart } },
      select: {
        stockId: true,
        dividendAmount: true,
        netAmount: true,
        currency: true,
      },
    }),
    options.usdJpyRate ?? getCurrentUsdJpyRate(),
  ])

  // 年初来配当は手取り（受取金額）基準で積む。受取金額を持たない旧レコードは
  // 税引前で代用する（ADR 0015）。円換算は銘柄の市場ではなくレコードの受取通貨で
  // 判定する（米国株でも証券会社の円受取があるため。ADR 0006）
  const ytdDividendByStock = new Map<number, number>()
  for (const d of dividends) {
    const prev = ytdDividendByStock.get(d.stockId) ?? 0
    const net = netDividendAmount(
      Number(d.dividendAmount),
      toNullableNumber(d.netAmount),
    )
    ytdDividendByStock.set(
      d.stockId,
      prev + toJpyByCurrency(net, d.currency, usdJpyRate),
    )
  }

  const rows = stocks.map((s): HoldingRow => {
    const sharesHeld = Number(s.sharesHeld)
    const currentPrice = Number(s.currentPrice) // 単価はドル建てのまま（表示側で $ 表記）
    return {
      id: s.id,
      stockName: s.stockName,
      code: s.code,
      brokerName: s.holdingCompany,
      market: s.market,
      marketSector: s.marketSector || null,
      sharesHeld,
      avgAcquisitionPrice: Number(s.avgAcquisitionPrice),
      // 金額系は米国株のみ当日レートで円換算する
      investmentAmount: toJpy(Number(s.investmentAmount), s.market, usdJpyRate),
      currentPrice,
      currentValue: toJpy(sharesHeld * currentPrice, s.market, usdJpyRate),
      profitLoss: toJpy(Number(s.profitLoss), s.market, usdJpyRate),
      profitLossRate: Number(s.profitLossRate), // 率は換算不変（パーセントの値）
      ytdDividend: ytdDividendByStock.get(s.id) ?? 0,
      priceUpdateStatus: s.priceUpdateStatus,
      priceUpdateError: s.priceUpdateError,
      lastPriceUpdate: s.lastPriceUpdate,
    }
  })

  return { rows, usdJpyRate }
}
