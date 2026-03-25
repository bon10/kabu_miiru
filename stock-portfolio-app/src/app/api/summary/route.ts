import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

export async function GET() {
  try {
    const stocks = await prisma.stock.findMany()
    const holdingStocks = stocks.filter(stock => Number(stock.sharesHeld) > 0)

    // 全体サマリーを計算
    const totalInvestment = stocks.reduce((sum, stock) => sum + Number(stock.investmentAmount), 0)
    const totalCurrentValue = holdingStocks.reduce((sum, stock) => 
      sum + (Number(stock.currentPrice) * Number(stock.sharesHeld)), 0)
    const totalProfitLoss = stocks.reduce((sum, stock) => sum + Number(stock.profitLoss), 0)
    const totalDividend = stocks.reduce((sum, stock) => sum + Number(stock.dividendAmount), 0)
    const totalProfitLossRate = totalInvestment > 0 ? totalProfitLoss / totalInvestment : 0

    // 証券会社数を計算
    const companies = new Set(stocks.map(stock => stock.holdingCompany))

    // 市場別の内訳を計算
    const domesticStocks = stocks.filter(stock => stock.market === '国内')
    const usStocks = stocks.filter(stock => stock.market === '米国')

    const domesticInvestment = domesticStocks.reduce((sum, stock) => sum + Number(stock.investmentAmount), 0)
    const domesticProfitLoss = domesticStocks.reduce((sum, stock) => sum + Number(stock.profitLoss), 0)
    const domesticStockCount = domesticStocks.filter(stock => Number(stock.sharesHeld) > 0).length

    const usInvestment = usStocks.reduce((sum, stock) => sum + Number(stock.investmentAmount), 0)
    const usProfitLoss = usStocks.reduce((sum, stock) => sum + Number(stock.profitLoss), 0)
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
      totalDividend,
      stockCount: holdingStocks.length,
      companiesCount: companies.size,
      lastUpdated: lastPriceUpdate || new Date(),
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