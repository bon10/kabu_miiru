import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { dateKeyOf, dateKeyParts, toDateKey } from '@/lib/date-key'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'month'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let dateFilter: Record<string, Date> = {}

    // 「今日」「今月」「今年」の境目は、サーバーのローカル時刻ではなく
    // JST の暦日で判定する（ADR 0012）。Vercel の関数は UTC で動くため、
    // ローカル時刻に頼ると日本時間の 0〜9 時のあいだ 1 日前の月・年で集計してしまう。
    const today = toDateKey(new Date())
    const { year: y, month: m, day: d } = dateKeyParts(today)

    if (period === 'custom' && startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    } else {
      switch (period) {
        case 'week': {
          dateFilter = { gte: dateKeyOf(y, m, d - 7) }
          break
        }
        case 'month': {
          dateFilter = { gte: dateKeyOf(y, m - 1, d) }
          break
        }
        case 'quarter': {
          dateFilter = { gte: dateKeyOf(y, m - 3, d) }
          break
        }
        case 'year': {
          dateFilter = { gte: dateKeyOf(y - 1, m, d) }
          break
        }
        default: {
          dateFilter = { gte: dateKeyOf(y, m - 1, d) }
        }
      }
    }

    // 配当合計はカレンダー年で集計する（ADR 0004）。
    const thisYearStart = dateKeyOf(y, 0, 1)

    const [transactions, thisMonthTransactions, thisYearTransactions, thisYearDividends] =
      await Promise.all([
        prisma.transaction.findMany({ where: { transactionDate: dateFilter } }),
        prisma.transaction.findMany({
          where: {
            transactionDate: { gte: dateKeyOf(y, m, 1) },
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
