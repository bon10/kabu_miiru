import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'month'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let dateFilter: any = {}

    // 期間の設定
    const now = new Date()
    
    if (period === 'custom' && startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } else {
      switch (period) {
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          dateFilter = { gte: weekAgo }
          break
        case 'month':
          const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
          dateFilter = { gte: monthAgo }
          break
        case 'quarter':
          const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          dateFilter = { gte: quarterAgo }
          break
        case 'year':
          const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          dateFilter = { gte: yearAgo }
          break
        default:
          const defaultMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
          dateFilter = { gte: defaultMonthAgo }
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        transactionDate: dateFilter
      }
    })

    // サマリーを計算
    let totalBuy = 0
    let totalSell = 0
    let totalDividend = 0
    let totalProfit = 0
    const transactionCount = transactions.length

    transactions.forEach(transaction => {
      const amount = Number(transaction.totalAmount)
      
      switch (transaction.transactionType) {
        case 'BUY':
          totalBuy += amount
          break
        case 'SELL':
          totalSell += amount
          break
        case 'DIVIDEND':
          totalDividend += amount
          break
      }
    })

    // 利益は売却額 + 配当 - 購入額（手数料考慮なし）
    totalProfit = totalSell + totalDividend - totalBuy

    // 今月の統計
    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    
    const thisMonthTransactions = await prisma.transaction.findMany({
      where: {
        transactionDate: { gte: thisMonth }
      }
    })

    // 今年の統計
    const thisYear = new Date()
    thisYear.setMonth(0, 1)
    thisYear.setHours(0, 0, 0, 0)
    
    const thisYearTransactions = await prisma.transaction.findMany({
      where: {
        transactionDate: { gte: thisYear }
      }
    })

    const calculateStats = (transactions: any[]) => {
      let buyCount = 0, sellCount = 0, dividendCount = 0, totalAmount = 0
      
      transactions.forEach(t => {
        const amount = Number(t.totalAmount)
        totalAmount += amount
        
        switch (t.transactionType) {
          case 'BUY': buyCount++; break
          case 'SELL': sellCount++; break
          case 'DIVIDEND': dividendCount++; break
        }
      })
      
      return { buyCount, sellCount, dividendCount, totalAmount }
    }

    return Response.json(createSuccessResponse({
      totalTransactions: transactionCount,
      totalBuyAmount: totalBuy,
      totalSellAmount: totalSell,
      totalDividend,
      totalFees: 0, // 手数料の合計を計算する場合は追加
      periodStats: {
        thisMonth: calculateStats(thisMonthTransactions),
        thisYear: calculateStats(thisYearTransactions)
      }
    }))
  } catch (error) {
    return handleApiError(error)
  }
}