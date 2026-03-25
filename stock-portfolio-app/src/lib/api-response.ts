export interface ApiResponse<T = unknown> {
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  timestamp: string
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
    timestamp: new Date().toISOString()
  }
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown
): ApiResponse {
  return {
    error: {
      code,
      message,
      details
    },
    timestamp: new Date().toISOString()
  }
}

export function handleApiError(error: unknown): Response {
  console.error('API Error:', error)

  const prismaError = error as { code?: string }
  if (prismaError.code === 'P2002') {
    return Response.json(
      createErrorResponse('DUPLICATE_ENTRY', '重複したデータが存在します'),
      { status: 400 }
    )
  }
  
  if (prismaError.code === 'P2025') {
    return Response.json(
      createErrorResponse('NOT_FOUND', 'データが見つかりません'),
      { status: 404 }
    )
  }
  
  return Response.json(
    createErrorResponse('INTERNAL_SERVER_ERROR', 'サーバー内部でエラーが発生しました'),
    { status: 500 }
  )
}

export function validateRequest(request: Request, requiredFields: string[] = []): {
  isValid: boolean
  missingFields?: string[]
} {
  if (requiredFields.length === 0) {
    return { isValid: true }
  }
  
  // TODO: リクエストボディの検証ロジックを実装
  return { isValid: true }
}