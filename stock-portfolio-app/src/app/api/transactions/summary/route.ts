import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'month'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let dateFilter: Record<string, Date> = {}

    const now = new Date()

    if (period === 'custom' && startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    } else {
      switch (period) {
        case 'week': {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          dateFilter = { gte: weekAgo }
          break
        }
        case 'month': {
          const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
          dateFilter = { gte: monthAgo }
          break
        }
        case 'quarter': {
          const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          dateFilter = { gte: quarterAgo }
          break
        }
        case 'year': {
          const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          dateFilter = { gte: yearAgo }
          break
        }
        default: {
          const defaultMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
          dateFilter = { gte: defaultMonthAgo }
        }
      }
    }

    // 配当合計はカレンダー年で集計する（ADR 0004）。
    const thisYearStart = new Date(now.getFullYear(), 0, 1)

    const [transactions, thisMonthTransactions, thisYearTransactions, thisYearDividends] =
      await Promise.all([
        prisma.transaction.findMany({ where: { transactionDate: dateFilter } }),
        prisma.transaction.findMany({
          where: {
            transactionDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
          },
        }),
        prisma.transaction.findMany({
          where: { transactionDate: { gte: thisYearStart } },
        }),
        prisma.dividendHistory.findMany({
          where: { paymentDate: { gte: thisYearStart } },
        }),
      ])

    let totalBuy = 0
    let totalSell = 0
    let totalFees = 0
    transactions.forEach((t) => {
      const amount = Number(t.totalAmount)
      totalFees += Number(t.fee)
      if (t.transactionType === 'BUY') totalBuy += amount
      else if (t.transactionType === 'SELL') totalSell += amount
    })

    const totalDividend = thisYearDividends.reduce(
      (sum, d) => sum + Number(d.dividendAmount),
      0,
    )

    const calculateStats = (txs: { totalAmount: unknown; transactionType: string }[]) => {
      let buyCount = 0,
        sellCount = 0,
        totalAmount = 0
      txs.forEach((t) => {
        const amount = Number(t.totalAmount)
        totalAmount += amount
        if (t.transactionType === 'BUY') buyCount++
        else if (t.transactionType === 'SELL') sellCount++
      })
      return { buyCount, sellCount, totalAmount }
    }

    return Response.json(
      createSuccessResponse({
        totalTransactions: transactions.length,
        totalBuyAmount: totalBuy,
        totalSellAmount: totalSell,
        totalDividend,
        totalFees,
        periodStats: {
          thisMonth: calculateStats(thisMonthTransactions),
          thisYear: calculateStats(thisYearTransactions),
        },
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
