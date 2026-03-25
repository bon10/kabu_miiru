import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json(
        createErrorResponse('VALIDATION_ERROR', '証券会社名は必須です'),
        { status: 400 }
      )
    }

    const broker = await prisma.broker.update({
      where: { id: Number(id) },
      data: { name: name.trim() },
    })

    return Response.json(createSuccessResponse(broker))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // この証券会社を使用中の銘柄があるかチェック
    const stockCount = await prisma.stock.count({
      where: { holdingCompany: (await prisma.broker.findUnique({ where: { id: Number(id) } }))?.name ?? '' },
    })

    if (stockCount > 0) {
      return Response.json(
        createErrorResponse(
          'IN_USE',
          `この証券会社は${stockCount}件の銘柄で使用されているため削除できません`
        ),
        { status: 400 }
      )
    }

    await prisma.broker.delete({
      where: { id: Number(id) },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
