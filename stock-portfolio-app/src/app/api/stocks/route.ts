import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { calculateProfitLoss, getMarketFromCode } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const includeZero = searchParams.get('includeZero') === 'true'
    const market = searchParams.get('market')
    const holdingCompany = searchParams.get('holdingCompany')
    const sortBy = searchParams.get('sortBy') || 'stockName'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    // フィルター条件を構築
    const where: any = {}
    
    if (!includeZero) {
      where.sharesHeld = { gt: 0 }
    }
    
    if (market) {
      where.market = market
    }
    
    if (holdingCompany) {
      where.holdingCompany = holdingCompany
    }

    // ソート条件を構築
    const orderBy: any = {}
    orderBy[sortBy] = sortOrder

    const stocks = await prisma.stock.findMany({
      where,
      orderBy,
      include: {
        transactions: {
          orderBy: { transactionDate: 'desc' },
          take: 5
        }
      }
    })

    // フィルターオプションを取得
    const [markets, companies] = await Promise.all([
      prisma.stock.findMany({
        select: { market: true },
        distinct: ['market']
      }),
      prisma.stock.findMany({
        select: { holdingCompany: true },
        distinct: ['holdingCompany']
      })
    ])

    return Response.json(createSuccessResponse({
      stocks: stocks.map(stock => ({
        ...stock,
        sharesHeld: Number(stock.sharesHeld),
        avgAcquisitionPrice: Number(stock.avgAcquisitionPrice),
        investmentAmount: Number(stock.investmentAmount),
        currentPrice: Number(stock.currentPrice),
        profitLoss: Number(stock.profitLoss),
        profitLossRate: Number(stock.profitLossRate),
        dividendPerShare: Number(stock.dividendPerShare),
        dividendYield: Number(stock.dividendYield),
        dividendAmount: Number(stock.dividendAmount),
        realizedProfitLoss: stock.realizedProfitLoss ? Number(stock.realizedProfitLoss) : null,
        targetPrice: stock.targetPrice ? Number(stock.targetPrice) : null
      })),
      totalCount: stocks.length,
      filters: {
        market: markets.map(m => m.market),
        holdingCompany: companies.map(c => c.holdingCompany)
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
    if (!body.stockName || !body.holdingCompany || !body.code) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 }
      )
    }

    // 市場の自動判定
    const market = body.market || getMarketFromCode(body.code)

    const stock = await prisma.stock.create({
      data: {
        no: body.no,
        stockName: body.stockName,
        holdingCompany: body.holdingCompany,
        market,
        code: body.code,
        sharesHeld: body.sharesHeld || 0,
        avgAcquisitionPrice: body.avgAcquisitionPrice || 0,
        investmentAmount: body.investmentAmount || 0,
        dividendPerShare: body.dividendPerShare || 0,
        dividendYield: body.dividendYield || 0,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
        targetPrice: body.targetPrice,
        marketSector: body.marketSector,
        purpose: body.purpose
      }
    })

    return Response.json(createSuccessResponse({
      ...stock,
      sharesHeld: Number(stock.sharesHeld),
      avgAcquisitionPrice: Number(stock.avgAcquisitionPrice),
      investmentAmount: Number(stock.investmentAmount),
      currentPrice: Number(stock.currentPrice),
      profitLoss: Number(stock.profitLoss),
      profitLossRate: Number(stock.profitLossRate),
      dividendPerShare: Number(stock.dividendPerShare),
      dividendYield: Number(stock.dividendYield),
      dividendAmount: Number(stock.dividendAmount),
      realizedProfitLoss: stock.realizedProfitLoss ? Number(stock.realizedProfitLoss) : null,
      targetPrice: stock.targetPrice ? Number(stock.targetPrice) : null
    }), { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}