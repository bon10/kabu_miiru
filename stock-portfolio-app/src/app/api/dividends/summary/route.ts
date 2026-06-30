import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'

// 配当の年次・半期集計 API。
// 集計はカレンダー年基準（ADR 0004）：上半期 = 1-6 月、下半期 = 7-12 月。
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const yearParam = searchParams.get('year')
    const targetYear = yearParam ? parseInt(yearParam) : new Date().getFullYear()

    const yearStart = new Date(targetYear, 0, 1)
    const yearEnd = new Date(targetYear + 1, 0, 1)
    const halfYearBoundary = new Date(targetYear, 6, 1)
    const prevYearStart = new Date(targetYear - 1, 0, 1)

    const [thisYear, prevYear] = await Promise.all([
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: yearStart, lt: yearEnd } },
        include: {
          stock: { select: { stockName: true, code: true, holdingCompany: true } },
        },
      }),
      prisma.dividendHistory.findMany({
        where: { paymentDate: { gte: prevYearStart, lt: yearStart } },
        select: { dividendAmount: true },
      }),
    ])

    let yearTotal = 0
    let firstHalfTotal = 0
    let secondHalfTotal = 0

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
      const amount = Number(d.dividendAmount)
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

    const prevYearTotal = prevYear.reduce((sum, d) => sum + Number(d.dividendAmount), 0)

    return Response.json(
      createSuccessResponse({
        year: targetYear,
        yearTotal,
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
