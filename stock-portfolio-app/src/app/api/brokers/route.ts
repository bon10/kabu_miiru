import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function GET() {
  try {
    const brokers = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
    })

    return Response.json(createSuccessResponse(brokers))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json(
        createErrorResponse('VALIDATION_ERROR', '証券会社名は必須です'),
        { status: 400 }
      )
    }

    const broker = await prisma.broker.create({
      data: { name: name.trim() },
    })

    return Response.json(createSuccessResponse(broker), { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
