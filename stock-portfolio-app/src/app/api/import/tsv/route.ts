import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
} from '@/lib/api-response'
import { getMarketFromCode } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const optionsStr = formData.get('options') as string

    if (!file) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', 'TSVファイルが指定されていません'),
        { status: 400 }
      )
    }

    const options = optionsStr ? JSON.parse(optionsStr) : {}
    const replaceExisting = options.replaceExisting || false
    const skipHeader = options.skipHeader !== false // デフォルトでtrue

    // ファイル内容を読み取り
    const text = await file.text()
    const lines = text.split('\n').filter((line) => line.trim())

    if (lines.length === 0) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', 'ファイルが空です'),
        { status: 400 }
      )
    }

    let imported = 0
    let updated = 0
    let skipped = 0
    const errors: { line: number; error: string }[] = []

    // ヘッダー行をスキップ
    const dataLines = skipHeader ? lines.slice(1) : lines

    for (let i = 0; i < dataLines.length; i++) {
      const lineNumber = skipHeader ? i + 2 : i + 1
      const line = dataLines[i]
      const columns = line.split('\t')

      try {
        // TSVの列を想定した順序でパース
        // No, 銘柄名, 保有会社, 市場, コード, 保有株数, 平均取得単価, 投資額, 現在価格, 損益, 損益率, 1株配当金, 配当利回り, 配当金額, 購入日, 売却日, 実現損益, 目標価格, 市場・セクター, 目的
        if (columns.length < 5) {
          errors.push({ line: lineNumber, error: '必須カラムが不足しています' })
          continue
        }

        const [
          no,
          stockName,
          holdingCompany,
          market,
          code,
          sharesHeld,
          avgAcquisitionPrice,
          investmentAmount,
          currentPrice,
          profitLoss,
          profitLossRate,
          dividendPerShare,
          dividendYield,
          dividendAmount,
          purchaseDate,
          saleDate,
          realizedProfitLoss,
          targetPrice,
          marketSector,
          purpose,
        ] = columns

        if (!stockName || !holdingCompany || !code) {
          errors.push({
            line: lineNumber,
            error: '銘柄名、保有会社、コードは必須です',
          })
          continue
        }

        // 日付のパース
        const parsePurchaseDate =
          purchaseDate && purchaseDate.trim()
            ? new Date(purchaseDate.trim())
            : null
        const parseSaleDate =
          saleDate && saleDate.trim() ? new Date(saleDate.trim()) : null

        // 数値のパース（エラーハンドリング付き）
        const parseDecimal = (value: string, defaultValue = 0) => {
          if (!value || value.trim() === '') return defaultValue
          const parsed = parseFloat(value.replace(/,/g, ''))
          return isNaN(parsed) ? defaultValue : parsed
        }

        const stockData = {
          no: no && no.trim() ? parseInt(no.trim()) : null,
          stockName: stockName.trim(),
          holdingCompany: holdingCompany.trim(),
          market:
            market && market.trim()
              ? market.trim()
              : getMarketFromCode(code.trim()),
          code: code.trim(),
          sharesHeld: parseDecimal(sharesHeld),
          avgAcquisitionPrice: parseDecimal(avgAcquisitionPrice),
          investmentAmount: parseDecimal(investmentAmount),
          currentPrice: parseDecimal(currentPrice),
          profitLoss: parseDecimal(profitLoss),
          profitLossRate: parseDecimal(profitLossRate),
          dividendPerShare: parseDecimal(dividendPerShare),
          dividendYield: parseDecimal(dividendYield),
          dividendAmount: parseDecimal(dividendAmount),
          // TSV は購入日を 1 列しか持たない。取引履歴を伴わないインポートでは
          // 初回・最終を区別できないため、同じ日付を両方に入れる。取引が登録されれば
          // recalculateStockAggregates が Transaction から両方を上書きする。
          firstPurchaseDate: parsePurchaseDate,
          purchaseDate: parsePurchaseDate,
          saleDate: parseSaleDate,
          realizedProfitLoss:
            realizedProfitLoss && realizedProfitLoss.trim()
              ? parseDecimal(realizedProfitLoss)
              : null,
          targetPrice:
            targetPrice && targetPrice.trim()
              ? parseDecimal(targetPrice)
              : null,
          marketSector:
            marketSector && marketSector.trim() ? marketSector.trim() : null,
          purpose: purpose && purpose.trim() ? purpose.trim() : null,
        }

        // 既存レコードの確認
        const existingStock = await prisma.stock.findUnique({
          where: { code: stockData.code },
        })

        if (existingStock) {
          if (replaceExisting) {
            await prisma.stock.update({
              where: { code: stockData.code },
              data: stockData,
            })
            updated++
          } else {
            skipped++
          }
        } else {
          await prisma.stock.create({
            data: stockData,
          })
          imported++
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '不明なエラー'
        errors.push({ line: lineNumber, error: errorMessage })
      }
    }

    return Response.json(
      createSuccessResponse({
        imported,
        updated,
        skipped,
        errors,
      })
    )
  } catch (error) {
    return handleApiError(error)
  }
}
