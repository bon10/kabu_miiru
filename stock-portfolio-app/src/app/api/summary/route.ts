import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpy, toJpyByCurrency } from '@/lib/currency'
import { dateKeyOf, dateKeyParts, toDateKey } from '@/lib/date-key'

// ダッシュボード用サマリ API。
// 用語は docs/2-domain/ubiquitous-language.md を参照。
//   - expectedAnnualDividend: 予想年間配当（マスタ由来）
//   - ytdDividendReceived: YTD 配当（実際に受け取った金額、DividendHistory 由来、ADR 0004）
// 金額は全て円ベース。米国株のドル建て値は当日の USD/JPY レートで円換算する。
export async function GET() {
  try {
    // YTD の年の境目は JST の暦日で判定する（ADR 0004 / 0012）
    const yearStart = dateKeyOf(dateKeyParts(toDateKey(new Date())).year, 0, 1)
    const [stocks, ytdDividends, usdJpyRate] = await Promise.all([
      prisma.stock.findMany(),
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: yearStart } },
        select: { dividendAmount: true, currency: true },
      }),
      getCurrentUsdJpyRate(),
    ])
    const holdingStocks = stocks.filter(stock => Number(stock.sharesHeld) > 0)

    // 米国株はドル建てのため当日レートで円換算してから集計する
    const investmentJpy = (s: (typeof stocks)[number]) =>
      toJpy(Number(s.investmentAmount), s.market, usdJpyRate)
    const currentValueJpy = (s: (typeof stocks)[number]) =>
      toJpy(Number(s.currentPrice) * Number(s.sharesHeld), s.market, usdJpyRate)
    const profitLossJpy = (s: (typeof stocks)[number]) =>
      toJpy(Number(s.profitLoss), s.market, usdJpyRate)
    const dividendJpy = (s: (typeof stocks)[number]) =>
      toJpy(Number(s.dividendAmount), s.market, usdJpyRate)

    const totalInvestment = stocks.reduce((sum, stock) => sum + investmentJpy(stock), 0)
    const totalCurrentValue = holdingStocks.reduce((sum, stock) => sum + currentValueJpy(stock), 0)
    const totalProfitLoss = stocks.reduce((sum, stock) => sum + profitLossJpy(stock), 0)
    const expectedAnnualDividend = stocks.reduce((sum, stock) => sum + dividendJpy(stock), 0)
    // 受取配当は配当ごとの受取通貨で保存されているため、USD 建ては当日レートで円換算して合算する
    const ytdDividendReceived = ytdDividends.reduce(
      (sum, d) => sum + toJpyByCurrency(Number(d.dividendAmount), d.currency, usdJpyRate),
      0,
    )
    const totalProfitLossRate = totalInvestment > 0 ? totalProfitLoss / totalInvestment : 0

    // 証券会社数を計算
    const companies = new Set(stocks.map(stock => stock.holdingCompany))

    // 市場別の内訳を計算
    const domesticStocks = stocks.filter(stock => stock.market === '国内')
    const usStocks = stocks.filter(stock => stock.market === '米国')

    const domesticInvestment = domesticStocks.reduce((sum, stock) => sum + investmentJpy(stock), 0)
    const domesticProfitLoss = domesticStocks.reduce((sum, stock) => sum + profitLossJpy(stock), 0)
    const domesticStockCount = domesticStocks.filter(stock => Number(stock.sharesHeld) > 0).length

    const usInvestment = usStocks.reduce((sum, stock) => sum + investmentJpy(stock), 0)
    const usProfitLoss = usStocks.reduce((sum, stock) => sum + profitLossJpy(stock), 0)
    const usStockCount = usStocks.filter(stock => Number(stock.sharesHeld) > 0).length

    // 最後の価格更新日時を取得
    const lastPriceUpdate = stocks
      .filter(stock => stock.lastPriceUpdate)
      .sort((a, b) => b.lastPriceUpdate!.getTime() - a.lastPriceUpdate!.getTime())[0]
      ?.lastPriceUpdate

    return Response.json(createSuccessResponse({
      totalInvestment,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitLossRate,
      expectedAnnualDividend,
      ytdDividendReceived,
      stockCount: holdingStocks.length,
      companiesCount: companies.size,
      lastUpdated: lastPriceUpdate || new Date(),
      usdJpyRate,
      marketBreakdown: {
        domestic: {
          investment: domesticInvestment,
          profitLoss: domesticProfitLoss,
          stockCount: domesticStockCount
        },
        us: {
          investment: usInvestment,
          profitLoss: usProfitLoss,
          stockCount: usStockCount
        }
      }
    }))
  } catch (error) {
    return handleApiError(error)
  }
}