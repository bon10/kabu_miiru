import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { getMarketFromCode } from '@/lib/utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    
    if (isNaN(id)) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '無効なIDです'),
        { status: 400 }
      )
    }

    const [stock, brokers] = await Promise.all([
      prisma.stock.findUnique({
        where: { id },
        include: {
          transactions: {
            orderBy: { transactionDate: 'desc' }
          },
          dividendHistory: {
            orderBy: { paymentDate: 'desc' }
          },
          priceHistory: {
            orderBy: { recordedAt: 'desc' },
            take: 30
          }
        }
      }),
      prisma.broker.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    ])

    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '銘柄が見つかりません'),
        { status: 404 }
      )
    }

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
      targetPrice: stock.targetPrice ? Number(stock.targetPrice) : null,
      transactions: stock.transactions.map(t => ({
        ...t,
        shares: Number(t.shares),
        pricePerShare: Number(t.pricePerShare),
        totalAmount: Number(t.totalAmount),
        fee: Number(t.fee)
      })),
      dividendHistory: stock.dividendHistory.map(d => ({
        ...d,
        dividendAmount: Number(d.dividendAmount)
      })),
      priceHistory: stock.priceHistory.map(p => ({
        ...p,
        price: Number(p.price)
      })),
      brokers
    }))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()
    
    if (isNaN(id)) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '無効なIDです'),
        { status: 400 }
      )
    }

    // 銘柄の存在確認
    const existingStock = await prisma.stock.findUnique({
      where: { id }
    })

    if (!existingStock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '銘柄が見つかりません'),
        { status: 404 }
      )
    }

    // 市場の自動判定（コードが変更された場合）
    const market = body.code && body.code !== existingStock.code 
      ? getMarketFromCode(body.code) 
      : body.market || existingStock.market

    // 保有株数・平均取得単価・投資額・購入日は Transaction を Source of Truth
    // とするため (ADR 0003)、PUT 経由での書き換えを無視する。
    const stock = await prisma.stock.update({
      where: { id },
      data: {
        no: body.no !== undefined ? body.no : existingStock.no,
        stockName: body.stockName || existingStock.stockName,
        holdingCompany: body.holdingCompany || existingStock.holdingCompany,
        market,
        code: body.code || existingStock.code,
        dividendPerShare: body.dividendPerShare !== undefined ? body.dividendPerShare : existingStock.dividendPerShare,
        dividendYield: body.dividendYield !== undefined ? body.dividendYield : existingStock.dividendYield,
        targetPrice: body.targetPrice !== undefined ? body.targetPrice : existingStock.targetPrice,
        marketSector: body.marketSector !== undefined ? body.marketSector : existingStock.marketSector,
        purpose: body.purpose !== undefined ? body.purpose : existingStock.purpose
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
    }))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    
    if (isNaN(id)) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '無効なIDです'),
        { status: 400 }
      )
    }

    // 銘柄の存在確認
    const existingStock = await prisma.stock.findUnique({
      where: { id }
    })

    if (!existingStock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '銘柄が見つかりません'),
        { status: 404 }
      )
    }

    await prisma.stock.delete({
      where: { id }
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}