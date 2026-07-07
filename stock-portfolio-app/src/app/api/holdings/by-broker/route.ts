import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpy } from '@/lib/currency'

// 証券会社別の保有銘柄ビュー。
// 各証券会社のサマリと、その下の銘柄リストを返す。
// ドメイン用語は docs/2-domain/ubiquitous-language.md を参照。
//   - デフォルト: 保有株数 > 0 の銘柄のみ（= 現保有）
//   - includeZero=true: 過去に保有していた銘柄も含める
// 金額（投資額・評価額・損益）は円ベース。米国株は当日の USD/JPY レートで
// 円換算する。単価（平均取得・現在価格）はドル建てのまま返し、表示側で $ 表記する。
export async function GET(request: NextRequest) {
  try {
    const includeZero = request.nextUrl.searchParams.get('includeZero') === 'true'
    const yearStart = new Date(new Date().getFullYear(), 0, 1)

    const stockWhere: Prisma.StockWhereInput = includeZero
      ? {}
      : { sharesHeld: { gt: 0 } }

    const [stocks, dividends, usdJpyRate] = await Promise.all([
      prisma.stock.findMany({
        where: stockWhere,
        orderBy: { stockName: 'asc' },
      }),
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: yearStart } },
        select: { stockId: true, dividendAmount: true },
      }),
      getCurrentUsdJpyRate(),
    ])

    const ytdDividendByStock = new Map<number, number>()
    for (const d of dividends) {
      const prev = ytdDividendByStock.get(d.stockId) ?? 0
      ytdDividendByStock.set(d.stockId, prev + Number(d.dividendAmount))
    }

    type HoldingRow = {
      id: number
      stockName: string
      code: string
      market: string
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
    }

    type BrokerGroup = {
      brokerName: string
      stockCount: number
      totalInvestment: number
      totalCurrentValue: number
      totalProfitLoss: number
      totalProfitLossRate: number
      totalYtdDividend: number
      holdings: HoldingRow[]
    }

    const brokerMap = new Map<string, BrokerGroup>()

    for (const s of stocks) {
      const sharesHeld = Number(s.sharesHeld)
      const currentPrice = Number(s.currentPrice) // 単価はドル建てのまま（表示側で $ 表記）
      // 金額系は米国株のみ当日レートで円換算する
      const investmentAmount = toJpy(Number(s.investmentAmount), s.market, usdJpyRate)
      const currentValue = toJpy(sharesHeld * currentPrice, s.market, usdJpyRate)
      const profitLoss = toJpy(Number(s.profitLoss), s.market, usdJpyRate)
      const profitLossRate = Number(s.profitLossRate) // 率は換算不変
      const ytdDividend = ytdDividendByStock.get(s.id) ?? 0

      const row: HoldingRow = {
        id: s.id,
        stockName: s.stockName,
        code: s.code,
        market: s.market,
        sharesHeld,
        avgAcquisitionPrice: Number(s.avgAcquisitionPrice),
        investmentAmount,
        currentPrice,
        currentValue,
        profitLoss,
        profitLossRate,
        ytdDividend,
        priceUpdateStatus: s.priceUpdateStatus,
        priceUpdateError: s.priceUpdateError,
      }

      const group = brokerMap.get(s.holdingCompany) ?? {
        brokerName: s.holdingCompany,
        stockCount: 0,
        totalInvestment: 0,
        totalCurrentValue: 0,
        totalProfitLoss: 0,
        totalProfitLossRate: 0,
        totalYtdDividend: 0,
        holdings: [],
      }
      group.stockCount += 1
      group.totalInvestment += investmentAmount
      group.totalCurrentValue += currentValue
      group.totalProfitLoss += profitLoss
      group.totalYtdDividend += ytdDividend
      group.holdings.push(row)
      brokerMap.set(s.holdingCompany, group)
    }

    const brokers = Array.from(brokerMap.values())
      .map((b) => ({
        ...b,
        totalProfitLossRate:
          b.totalInvestment > 0 ? (b.totalProfitLoss / b.totalInvestment) * 100 : 0,
      }))
      .sort((a, b) => b.totalInvestment - a.totalInvestment)

    const grand = brokers.reduce(
      (acc, b) => {
        acc.totalInvestment += b.totalInvestment
        acc.totalCurrentValue += b.totalCurrentValue
        acc.totalProfitLoss += b.totalProfitLoss
        acc.totalYtdDividend += b.totalYtdDividend
        acc.totalStocks += b.stockCount
        return acc
      },
      {
        totalInvestment: 0,
        totalCurrentValue: 0,
        totalProfitLoss: 0,
        totalProfitLossRate: 0,
        totalYtdDividend: 0,
        totalStocks: 0,
        brokerCount: brokers.length,
      },
    )
    grand.totalProfitLossRate =
      grand.totalInvestment > 0 ? (grand.totalProfitLoss / grand.totalInvestment) * 100 : 0

    return Response.json(createSuccessResponse({ brokers, grandTotal: grand }))
  } catch (error) {
    return handleApiError(error)
  }
}
