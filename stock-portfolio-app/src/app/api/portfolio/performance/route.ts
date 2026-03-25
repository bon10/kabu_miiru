import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

export async function GET() {
  try {
    const stocks = await prisma.stock.findMany({
      where: {
        sharesHeld: { gt: 0 }
      }
    })

    const data = stocks.map(stock => ({
      stockName: stock.stockName,
      profitLossRate: Number(stock.profitLossRate),
      profitLoss: Number(stock.profitLoss),
      investmentAmount: Number(stock.investmentAmount)
    }))

    // 損益率でソート（降順）
    data.sort((a, b) => b.profitLossRate - a.profitLossRate)

    return Response.json(createSuccessResponse(data))
  } catch (error) {
    return handleApiError(error)
  }
}