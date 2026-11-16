import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpyByCurrency } from '@/lib/currency'
import {
  netDividendAmount,
  parseDividendInput,
  toNullableNumber,
} from '@/lib/dividend'
import { dateKeyOf } from '@/lib/date-key'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const stockId = searchParams.get('stockId')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Prisma.DividendHistoryWhereInput = {}

    if (stockId) {
      where.stockId = parseInt(stockId)
    }

    if (year) {
      // 年の境目は JST の暦日で判定する（ADR 0004 / 0012）
      const y = parseInt(year)
      where.paymentDate = {
        gte: dateKeyOf(y, 0, 1),
        lt: dateKeyOf(y + 1, 0, 1),
      }
    } else if (startDate || endDate) {
      where.paymentDate = {}
      if (startDate) where.paymentDate.gte = new Date(startDate)
      if (endDate) where.paymentDate.lte = new Date(endDate)
    }

    const skip = (page - 1) * limit

    const [dividends, totalCount] = await Promise.all([
      prisma.dividendHistory.findMany({
        where,
        include: {
          stock: {
            select: { stockName: true, code: true, holdingCompany: true },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dividendHistory.count({ where }),
    ])

    // USD 建ての配当があるときだけ当日レートを取得して円換算する。
    // 円建てのみなら換算不要なので、外部リクエストを避けてレート取得をスキップする。
    const hasUsd = dividends.some((d) => d.currency === 'USD')
    const usdJpyRate = hasUsd ? await getCurrentUsdJpyRate() : 1

    return Response.json(
      createSuccessResponse({
        dividends: dividends.map((d) => {
          // 手取り＝受取金額。持たない旧レコードは税引前で代用する（ADR 0015）
          const net = netDividendAmount(Number(d.dividendAmount), toNullableNumber(d.netAmount))
          return {
            id: d.id,
            stockId: d.stockId,
            stockName: d.stock.stockName,
            stockCode: d.stock.code,
            holdingCompany: d.stock.holdingCompany,
            dividendAmount: Number(d.dividendAmount),
            shares: toNullableNumber(d.shares),
            taxAmount: toNullableNumber(d.taxAmount),
            netAmount: toNullableNumber(d.netAmount),
            currency: d.currency,
            dividendAmountJpy: toJpyByCurrency(Number(d.dividendAmount), d.currency, usdJpyRate),
            netAmountJpy: toJpyByCurrency(net, d.currency, usdJpyRate),
            paymentDate: d.paymentDate.toISOString(),
            dividendType: d.dividendType,
          }
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // 入力は証券会社の配当明細を写したもの（ADR 0015）。検証と保存値の組み立ては
    // 更新 API（PUT /api/dividends/[id]）と同じ関数を通す。
    const input = parseDividendInput(await request.json())
    if (!input.ok) {
      return Response.json(createErrorResponse('BAD_REQUEST', input.message), { status: 400 })
    }

    // 銘柄の存在確認のみ。配当合計に掛ける株数は明細の数量なので、保有株数は参照しない
    const stock = await prisma.stock.findUnique({
      where: { id: input.data.stockId },
      select: { id: true },
    })
    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'),
        { status: 404 },
      )
    }

    const created = await prisma.dividendHistory.create({
      data: input.data,
      include: {
        stock: {
          select: { stockName: true, code: true, holdingCompany: true },
        },
      },
    })

    return Response.json(
      createSuccessResponse({
        id: created.id,
        stockId: created.stockId,
        stockName: created.stock.stockName,
        stockCode: created.stock.code,
        holdingCompany: created.stock.holdingCompany,
        dividendAmount: Number(created.dividendAmount),
        shares: toNullableNumber(created.shares),
        taxAmount: toNullableNumber(created.taxAmount),
        netAmount: toNullableNumber(created.netAmount),
        currency: created.currency,
        paymentDate: created.paymentDate.toISOString(),
        dividendType: created.dividendType,
      }),
      { status: 201 },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
