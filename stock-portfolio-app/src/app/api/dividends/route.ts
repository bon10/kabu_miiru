import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

const ALLOWED_DIVIDEND_TYPES = ['期末', '中間', '特別'] as const

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
      const y = parseInt(year)
      where.paymentDate = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1),
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

    return Response.json(
      createSuccessResponse({
        dividends: dividends.map((d) => ({
          id: d.id,
          stockId: d.stockId,
          stockName: d.stock.stockName,
          stockCode: d.stock.code,
          holdingCompany: d.stock.holdingCompany,
          dividendAmount: Number(d.dividendAmount),
          paymentDate: d.paymentDate.toISOString(),
          dividendType: d.dividendType,
        })),
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
    const body = await request.json()

    if (
      !body.stockId ||
      body.dividendAmount === undefined ||
      !body.paymentDate ||
      !body.dividendType
    ) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 },
      )
    }

    const dividendAmount = Number(body.dividendAmount)
    if (!Number.isFinite(dividendAmount) || dividendAmount <= 0) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '配当金額は 0 より大きい値を指定してください'),
        { status: 400 },
      )
    }

    if (!ALLOWED_DIVIDEND_TYPES.includes(body.dividendType)) {
      return Response.json(
        createErrorResponse(
          'BAD_REQUEST',
          `配当種別は ${ALLOWED_DIVIDEND_TYPES.join(' / ')} のいずれかを指定してください`,
        ),
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

    const created = await prisma.dividendHistory.create({
      data: {
        stockId: body.stockId,
        dividendAmount,
        paymentDate: new Date(body.paymentDate),
        dividendType: body.dividendType,
      },
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
        paymentDate: created.paymentDate.toISOString(),
        dividendType: created.dividendType,
      }),
      { status: 201 },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
