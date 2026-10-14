import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { dateKeyOf, dateKeyParts, toDateKey } from '@/lib/date-key'
import { isUsStock, toJpy, toJpyByCurrency } from '@/lib/currency'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { netDividendAmount, toNullableNumber } from '@/lib/dividend'

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

    // 取引金額は銘柄の建値通貨で保存されているため、合算の前に市場で換算する。
    // そのため取引には銘柄の market を同時に読む（ADR 0005）。
    const withMarket = { stock: { select: { market: true } } }

    const [transactions, thisMonthTransactions, thisYearTransactions, thisYearDividends] =
      await Promise.all([
        prisma.transaction.findMany({
          where: { transactionDate: dateFilter },
          include: withMarket,
        }),
        prisma.transaction.findMany({
          where: {
            transactionDate: { gte: dateKeyOf(y, m, 1) },
          },
          include: withMarket,
        }),
        prisma.transaction.findMany({
          where: { transactionDate: { gte: thisYearStart } },
          include: withMarket,
        }),
        prisma.dividendHistory.findMany({
          where: { paymentDate: { gte: thisYearStart } },
        }),
      ])

    // 集計は円ベースに統一する。ドル建ての取引・配当は当日レートで円換算してから合算する
    // （ADR 0005）。ドル建てが 1 件も無ければ換算不要なのでレート取得をスキップする。
    const hasUsTransaction = [
      transactions,
      thisMonthTransactions,
      thisYearTransactions,
    ].some((txs) => txs.some((t) => isUsStock(t.stock.market)))
    const hasUsdDividend = thisYearDividends.some((d) => d.currency === 'USD')
    const usdJpyRate =
      hasUsTransaction || hasUsdDividend ? await getCurrentUsdJpyRate() : 1

    let totalBuy = 0
    let totalSell = 0
    let totalFees = 0
    transactions.forEach((t) => {
      const amount = toJpy(Number(t.totalAmount), t.stock.market, usdJpyRate)
      // 手数料も建値通貨で保存されている（米国株の取引手数料はドル建て）
      totalFees += toJpy(Number(t.fee), t.stock.market, usdJpyRate)
      if (t.transactionType === 'BUY') totalBuy += amount
      else if (t.transactionType === 'SELL') totalSell += amount
    })

    // 配当の集計は手取り（受取金額）基準。受取金額を持たない旧レコードは
    // 税引前で代用する（ADR 0015）。通貨は銘柄の市場ではなくレコードの
    // 受取通貨で判定する（米国株の円受取があるため。ADR 0006）
    const totalDividend = thisYearDividends.reduce(
      (sum, d) =>
        sum +
        toJpyByCurrency(
          netDividendAmount(Number(d.dividendAmount), toNullableNumber(d.netAmount)),
          d.currency,
          usdJpyRate,
        ),
      0,
    )

    const calculateStats = (
      txs: {
        totalAmount: unknown
        transactionType: string
        stock: { market: string }
      }[],
    ) => {
      let buyCount = 0,
        sellCount = 0,
        totalAmount = 0
      txs.forEach((t) => {
        totalAmount += toJpy(Number(t.totalAmount), t.stock.market, usdJpyRate)
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
