import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/date-key'
import { isUsStock, toJpy } from '@/lib/currency'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import {
  assertNoOrphanedSells,
  recalculateStockAggregates,
  TransactionOrderError,
  validateSellTransaction,
} from '@/lib/stock-aggregation'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const stockId = searchParams.get('stockId')
    const type = searchParams.get('type')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Prisma.TransactionWhereInput = {}

    if (stockId) {
      where.stockId = parseInt(stockId)
    }

    if (type === 'BUY' || type === 'SELL') {
      where.transactionType = type
    }

    if (startDate || endDate) {
      where.transactionDate = {}
      if (startDate) {
        where.transactionDate.gte = new Date(startDate)
      }
      if (endDate) {
        where.transactionDate.lte = new Date(endDate)
      }
    }

    const skip = (page - 1) * limit

    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          stock: {
            select: {
              stockName: true,
              code: true,
              market: true,
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    const totalPages = Math.ceil(totalCount / limit)

    // 米国株の取引があるときだけ当日レートを取得して円換算する（ADR 0005）。
    // 国内株だけなら換算不要なので、外部リクエストを避けてレート取得をスキップする。
    const hasUsStock = transactions.some((t) => isUsStock(t.stock.market))
    const usdJpyRate = hasUsStock ? await getCurrentUsdJpyRate() : 1

    return Response.json(
      createSuccessResponse({
        // 取引金額・手数料は銘柄の建値通貨で保存されている（米国株はドル建て）。
        // 建値通貨のままの値と円換算した値を併せて返し、表示側で使い分けさせる（ADR 0005）。
        transactions: transactions.map((t) => ({
          id: t.id,
          stockId: t.stockId,
          stockName: t.stock.stockName,
          stockCode: t.stock.code,
          market: t.stock.market,
          transactionType: t.transactionType,
          shares: Number(t.shares),
          pricePerShare: Number(t.pricePerShare),
          totalAmount: Number(t.totalAmount),
          totalAmountJpy: toJpy(
            Number(t.totalAmount),
            t.stock.market,
            usdJpyRate,
          ),
          fee: Number(t.fee),
          feeJpy: toJpy(Number(t.fee), t.stock.market, usdJpyRate),
          transactionDate: t.transactionDate.toISOString(),
          memo: t.memo,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (
      !body.stockId ||
      !body.transactionType ||
      body.shares === undefined ||
      body.pricePerShare === undefined ||
      !body.transactionDate
    ) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 },
      )
    }

    if (body.transactionType !== 'BUY' && body.transactionType !== 'SELL') {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '取引種別は BUY または SELL である必要があります'),
        { status: 400 },
      )
    }

    const shares = Number(body.shares)
    const pricePerShare = Number(body.pricePerShare)
    if (shares <= 0 || pricePerShare < 0) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '株数は 0 より大きく、単価は 0 以上である必要があります'),
        { status: 400 },
      )
    }

    const stock = await prisma.stock.findUnique({ where: { id: body.stockId } })
    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'),
        { status: 404 },
      )
    }

    if (body.transactionType === 'SELL') {
      const validation = await validateSellTransaction(body.stockId, shares)
      if (!validation.ok) {
        return Response.json(createErrorResponse('BAD_REQUEST', validation.reason), {
          status: 400,
        })
      }
    }

    const totalAmount = body.totalAmount ?? shares * pricePerShare

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          stockId: body.stockId,
          transactionType: body.transactionType,
          shares,
          pricePerShare,
          totalAmount,
          fee: body.fee ?? 0,
          transactionDate: toDateKey(new Date(body.transactionDate)),
          memo: body.memo,
        },
        include: {
          stock: {
            select: { stockName: true, code: true },
          },
        },
      })
      // validateSellTransaction は現時点の保有株数しか見ないため、過去日付の SELL が
      // 先行する BUY より前に来るケースを検出できない。再計算結果で最終確認する。
      assertNoOrphanedSells(await recalculateStockAggregates(body.stockId, tx))
      return created
    })

    return Response.json(
      createSuccessResponse({
        id: transaction.id,
        stockId: transaction.stockId,
        stockName: transaction.stock.stockName,
        stockCode: transaction.stock.code,
        transactionType: transaction.transactionType,
        shares: Number(transaction.shares),
        pricePerShare: Number(transaction.pricePerShare),
        totalAmount: Number(transaction.totalAmount),
        fee: Number(transaction.fee),
        transactionDate: transaction.transactionDate.toISOString(),
        memo: transaction.memo,
      }),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof TransactionOrderError) {
      return Response.json(
        createErrorResponse('INVALID_TRANSACTION_ORDER', error.message, error.orphanedSells),
        { status: 400 },
      )
    }
    return handleApiError(error)
  }
}
