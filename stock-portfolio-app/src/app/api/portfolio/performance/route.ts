import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpy } from '@/lib/currency'

// パフォーマンス API。金額は円ベース（米国株は当日レートで円換算）。損益率は換算不変。
export async function GET() {
  try {
    const [stocks, usdJpyRate] = await Promise.all([
      prisma.stock.findMany({
        where: {
          sharesHeld: { gt: 0 }
        }
      }),
      getCurrentUsdJpyRate(),
    ])

    const data = stocks.map(stock => ({
      stockName: stock.stockName,
      profitLossRate: Number(stock.profitLossRate),
      profitLoss: toJpy(Number(stock.profitLoss), stock.market, usdJpyRate),
      investmentAmount: toJpy(Number(stock.investmentAmount), stock.market, usdJpyRate)
    }))

    // 損益率でソート（降順）
    data.sort((a, b) => b.profitLossRate - a.profitLossRate)

    return Response.json(createSuccessResponse(data))
  } catch (error) {
    return handleApiError(error)
  }
}