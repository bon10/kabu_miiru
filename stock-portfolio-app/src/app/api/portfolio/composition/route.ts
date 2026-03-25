import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

export async function GET() {
  try {
    const stocks = await prisma.stock.findMany({
      where: {
        sharesHeld: { gt: 0 }
      }
    })

    // 銘柄別構成（保有株数ベース）
    const byStock = stocks.map(stock => ({
      stockName: stock.stockName,
      sharesHeld: Number(stock.sharesHeld),
      investmentAmount: Number(stock.investmentAmount),
      percentage: 0, // 後で計算
      profitLoss: Number(stock.profitLoss),
      profitLossRate: Number(stock.profitLossRate)
    }))

    // 証券会社別構成
    const companyMap = new Map<string, { shares: number, amount: number, count: number }>()
    stocks.forEach(stock => {
      const current = companyMap.get(stock.holdingCompany) || { shares: 0, amount: 0, count: 0 }
      companyMap.set(stock.holdingCompany, {
        shares: current.shares + Number(stock.sharesHeld),
        amount: current.amount + Number(stock.investmentAmount),
        count: current.count + 1
      })
    })
    
    const byCompany = Array.from(companyMap.entries()).map(([holdingCompany, data]) => ({
      holdingCompany,
      sharesHeld: data.shares,
      investmentAmount: data.amount,
      percentage: 0, // 後で計算
      stockCount: data.count
    }))

    // 市場別構成
    const marketMap = new Map<string, { shares: number, amount: number, count: number }>()
    stocks.forEach(stock => {
      const current = marketMap.get(stock.market) || { shares: 0, amount: 0, count: 0 }
      marketMap.set(stock.market, {
        shares: current.shares + Number(stock.sharesHeld),
        amount: current.amount + Number(stock.investmentAmount),
        count: current.count + 1
      })
    })
    
    const byMarket = Array.from(marketMap.entries()).map(([market, data]) => ({
      market,
      sharesHeld: data.shares,
      investmentAmount: data.amount,
      percentage: 0, // 後で計算
      stockCount: data.count
    }))

    // パーセンテージを計算（保有株数ベース）
    const totalShares = stocks.reduce((sum, stock) => sum + Number(stock.sharesHeld), 0)
    
    byStock.forEach(item => {
      item.percentage = totalShares > 0 ? (item.sharesHeld / totalShares) * 100 : 0
    })
    
    byCompany.forEach(item => {
      item.percentage = totalShares > 0 ? (item.sharesHeld / totalShares) * 100 : 0
    })
    
    byMarket.forEach(item => {
      item.percentage = totalShares > 0 ? (item.sharesHeld / totalShares) * 100 : 0
    })

    // 値でソート（降順）
    byStock.sort((a, b) => b.investmentAmount - a.investmentAmount)
    byCompany.sort((a, b) => b.investmentAmount - a.investmentAmount)
    byMarket.sort((a, b) => b.investmentAmount - a.investmentAmount)

    return Response.json(createSuccessResponse({
      byStock,
      byCompany,
      byMarket
    }))
  } catch (error) {
    return handleApiError(error)
  }
}