import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const stockId = searchParams.get('stockId')
    const type = searchParams.get('type')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // フィルター条件を構築
    const where: any = {}
    
    if (stockId) {
      where.stockId = parseInt(stockId)
    }
    
    if (type) {
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

    // ページネーション
    const skip = (page - 1) * limit
    
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          stock: {
            select: {
              stockName: true,
              code: true
            }
          }
        },
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limit
      }),
      prisma.transaction.count({ where })
    ])

    const totalPages = Math.ceil(totalCount / limit)

    return Response.json(createSuccessResponse({
      transactions: transactions.map(t => ({
        id: t.id,
        stockName: t.stock.stockName,
        transactionType: t.transactionType,
        shares: Number(t.shares),
        pricePerShare: Number(t.pricePerShare),
        totalAmount: Number(t.totalAmount),
        fee: Number(t.fee),
        transactionDate: t.transactionDate.toISOString(),
        memo: t.memo
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 必須フィールドの検証
    if (!body.stockId || !body.transactionType || !body.shares || !body.pricePerShare || !body.transactionDate) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 }
      )
    }

    // 銘柄の存在確認
    const stock = await prisma.stock.findUnique({
      where: { id: body.stockId }
    })

    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'),
        { status: 404 }
      )
    }

    const totalAmount = body.totalAmount || (body.shares * body.pricePerShare)

    const transaction = await prisma.transaction.create({
      data: {
        stockId: body.stockId,
        transactionType: body.transactionType,
        shares: body.shares,
        pricePerShare: body.pricePerShare,
        totalAmount,
        fee: body.fee || 0,
        transactionDate: new Date(body.transactionDate),
        memo: body.memo
      },
      include: {
        stock: {
          select: {
            stockName: true,
            code: true
          }
        }
      }
    })

    return Response.json(createSuccessResponse({
      ...transaction,
      stockName: transaction.stock.stockName,
      shares: Number(transaction.shares),
      pricePerShare: Number(transaction.pricePerShare),
      totalAmount: Number(transaction.totalAmount),
      fee: Number(transaction.fee)
    }), { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}