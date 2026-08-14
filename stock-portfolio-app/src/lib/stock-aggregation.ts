import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma

// 平均取得単価法で Transaction から Stock 集計値を再計算する。
// Source of truth は Transaction（ADR 0003）。
export async function recalculateStockAggregates(
  stockId: number,
  client: PrismaClientOrTx = prisma,
): Promise<void> {
  const [stock, transactions] = await Promise.all([
    client.stock.findUnique({ where: { id: stockId } }),
    client.transaction.findMany({
      where: { stockId },
      orderBy: { transactionDate: 'asc' },
    }),
  ])

  if (!stock) return

  let shares = 0
  let costBasis = 0
  let realizedProfitLoss = 0
  let lastPurchaseDate: Date | null = null
  let lastSaleDate: Date | null = null

  for (const tx of transactions) {
    const txShares = Number(tx.shares)
    const txPrice = Number(tx.pricePerShare)
    const txFee = Number(tx.fee)

    if (tx.transactionType === 'BUY') {
      costBasis += txShares * txPrice + txFee
      shares += txShares
      lastPurchaseDate = tx.transactionDate
    } else if (tx.transactionType === 'SELL') {
      if (shares <= 0) continue
      const avgPrice = costBasis / shares
      const sellShares = Math.min(txShares, shares)
      realizedProfitLoss += (txPrice - avgPrice) * sellShares - txFee
      costBasis -= avgPrice * sellShares
      shares -= sellShares
      lastSaleDate = tx.transactionDate
      if (shares <= 0) {
        shares = 0
        costBasis = 0
      }
    }
  }

  const avgAcquisitionPrice = shares > 0 ? costBasis / shares : 0
  const investmentAmount = costBasis
  const currentPrice = Number(stock.currentPrice)
  const unrealizedProfitLoss = shares > 0 ? (currentPrice - avgAcquisitionPrice) * shares : 0
  const profitLossRate =
    avgAcquisitionPrice > 0 ? ((currentPrice - avgAcquisitionPrice) / avgAcquisitionPrice) * 100 : 0

  await client.stock.update({
    where: { id: stockId },
    data: {
      sharesHeld: shares,
      avgAcquisitionPrice,
      investmentAmount,
      profitLoss: unrealizedProfitLoss,
      profitLossRate,
      realizedProfitLoss,
      purchaseDate: lastPurchaseDate ?? null,
      saleDate: lastSaleDate ?? null,
    },
  })
}

// SELL 取引の妥当性チェック。現時点の保有株数を超える売却はエラー。
export async function validateSellTransaction(
  stockId: number,
  sellShares: number,
  client: PrismaClientOrTx = prisma,
): Promise<{ ok: true } | { ok: false; reason: string; sharesHeld: number }> {
  const stock = await client.stock.findUnique({
    where: { id: stockId },
    select: { sharesHeld: true },
  })
  if (!stock) {
    return { ok: false, reason: '銘柄が見つかりません', sharesHeld: 0 }
  }
  const sharesHeld = Number(stock.sharesHeld)
  if (sellShares > sharesHeld) {
    return {
      ok: false,
      reason: `売却株数（${sellShares}）が保有株数（${sharesHeld}）を超えています`,
      sharesHeld,
    }
  }
  return { ok: true }
}
