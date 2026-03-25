import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

export async function GET() {
  try {
    const stocks = await prisma.stock.findMany()

    // 証券会社別にグループ化
    const companyMap = new Map<string, {
      companyName: string
      stockCount: number
      totalInvestment: number
      totalProfitLoss: number
      totalDividend: number
      profitLossRate: number
    }>()

    stocks.forEach(stock => {
      const companyName = stock.holdingCompany
      const existing = companyMap.get(companyName) || {
        companyName,
        stockCount: 0,
        totalInvestment: 0,
        totalProfitLoss: 0,
        totalDividend: 0,
        profitLossRate: 0
      }

      existing.stockCount += Number(stock.sharesHeld) > 0 ? 1 : 0
      existing.totalInvestment += Number(stock.investmentAmount)
      existing.totalProfitLoss += Number(stock.profitLoss)
      existing.totalDividend += Number(stock.dividendAmount)

      companyMap.set(companyName, existing)
    })

    // 損益率を計算
    const result = Array.from(companyMap.values()).map(company => ({
      ...company,
      profitLossRate: company.totalInvestment > 0 
        ? company.totalProfitLoss / company.totalInvestment 
        : 0
    }))

    // 投資額でソート（降順）
    result.sort((a, b) => b.totalInvestment - a.totalInvestment)

    return Response.json(createSuccessResponse(result))
  } catch (error) {
    return handleApiError(error)
  }
}