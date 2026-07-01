import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

// 証券会社別の保有銘柄ビュー。
// 各証券会社のサマリと、その下の銘柄リストを返す。
// 保有株数 0 の銘柄は除外する（過去に売却済みでもう持っていない銘柄）。
export async function GET() {
  try {
    const yearStart = new Date(new Date().getFullYear(), 0, 1)

    const [stocks, dividends] = await Promise.all([
      prisma.stock.findMany({
        where: { sharesHeld: { gt: 0 } },
        orderBy: { stockName: 'asc' },
      }),
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: yearStart } },
        select: { stockId: true, dividendAmount: true },
      }),
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
      const investmentAmount = Number(s.investmentAmount)
      const currentPrice = Number(s.currentPrice)
      const currentValue = sharesHeld * currentPrice
      const profitLoss = Number(s.profitLoss)
      const profitLossRate = Number(s.profitLossRate)
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
