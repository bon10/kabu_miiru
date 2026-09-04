import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpyByCurrency } from '@/lib/currency'
import { dateKeyOf, dateKeyParts, toDateKey } from '@/lib/date-key'
import { netDividendAmount, toNullableNumber } from '@/lib/dividend'

// 配当の年次・半期集計 API。
// 集計はカレンダー年基準（ADR 0004）：上半期 = 1-6 月、下半期 = 7-12 月。
// 年・半期の境目は JST の暦日で判定する（ADR 0012）。
// 金額は手取り（受取金額）基準（ADR 0015）。受取金額を持たない旧レコードは税引前で代用する。
// 税引前合計・税額合計も併せて返し、手取りとの差を画面で示せるようにしている。
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const yearParam = searchParams.get('year')
    const targetYear = yearParam
      ? parseInt(yearParam)
      : dateKeyParts(toDateKey(new Date())).year

    const yearStart = dateKeyOf(targetYear, 0, 1)
    const yearEnd = dateKeyOf(targetYear + 1, 0, 1)
    const halfYearBoundary = dateKeyOf(targetYear, 6, 1)
    const prevYearStart = dateKeyOf(targetYear - 1, 0, 1)

    const [thisYear, prevYear] = await Promise.all([
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: yearStart, lt: yearEnd } },
        include: {
          stock: { select: { stockName: true, code: true, holdingCompany: true } },
        },
      }),
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: prevYearStart, lt: yearStart } },
        select: { dividendAmount: true, netAmount: true, currency: true },
      }),
    ])

    // 集計は円ベースに統一する。USD 建ての配当は当日レートで円換算してから合算する。
    // 対象年・前年に USD 建てが 1 件も無ければ換算不要なのでレート取得をスキップする。
    const hasUsd =
      thisYear.some((d) => d.currency === 'USD') ||
      prevYear.some((d) => d.currency === 'USD')
    const usdJpyRate = hasUsd ? await getCurrentUsdJpyRate() : 1

    let yearTotal = 0
    let firstHalfTotal = 0
    let secondHalfTotal = 0
    let yearGrossTotal = 0
    let yearTaxTotal = 0

    type StockBreakdown = {
      stockId: number
      stockName: string
      stockCode: string
      holdingCompany: string
      total: number
      firstHalf: number
      secondHalf: number
      count: number
    }
    const byStock = new Map<number, StockBreakdown>()

    for (const d of thisYear) {
      const gross = Number(d.dividendAmount)
      // 手取り＝受取金額。持たない旧レコードは税引前で代用するので、その行の税額は 0 になる
      const net = netDividendAmount(gross, toNullableNumber(d.netAmount))
      const amount = toJpyByCurrency(net, d.currency, usdJpyRate)
      yearGrossTotal += toJpyByCurrency(gross, d.currency, usdJpyRate)
      yearTaxTotal += toJpyByCurrency(gross - net, d.currency, usdJpyRate)
      yearTotal += amount
      const isFirstHalf = d.paymentDate < halfYearBoundary
      if (isFirstHalf) firstHalfTotal += amount
      else secondHalfTotal += amount

      const entry = byStock.get(d.stockId) ?? {
        stockId: d.stockId,
        stockName: d.stock.stockName,
        stockCode: d.stock.code,
        holdingCompany: d.stock.holdingCompany,
        total: 0,
        firstHalf: 0,
        secondHalf: 0,
        count: 0,
      }
      entry.total += amount
      if (isFirstHalf) entry.firstHalf += amount
      else entry.secondHalf += amount
      entry.count += 1
      byStock.set(d.stockId, entry)
    }

    const prevYearTotal = prevYear.reduce(
      (sum, d) =>
        sum +
        toJpyByCurrency(
          netDividendAmount(Number(d.dividendAmount), toNullableNumber(d.netAmount)),
          d.currency,
          usdJpyRate,
        ),
      0,
    )

    return Response.json(
      createSuccessResponse({
        year: targetYear,
        yearTotal,
        yearGrossTotal,
        yearTaxTotal,
        firstHalfTotal,
        secondHalfTotal,
        prevYearTotal,
        yearOverYearDiff: yearTotal - prevYearTotal,
        count: thisYear.length,
        byStock: Array.from(byStock.values()).sort((a, b) => b.total - a.total),
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
