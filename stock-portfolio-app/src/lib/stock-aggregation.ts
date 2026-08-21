import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { formatDateKey } from '@/lib/daily-price'

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma

// 保有株数ゼロの時点に置かれてしまった SELL。
// 取引日を編集して BUY より前に来た場合や、先行する BUY を削除した場合に発生する。
// 平均取得単価法では取得原価が無く損益を計算できないため集計から除外されるが、
// 黙って除外すると実現損益が警告なく消える。呼び出し側で弾けるよう返す（ADR 0008）。
export interface OrphanedSell {
  transactionId: number
  transactionDate: Date
  shares: number
}

export interface RecalculationResult {
  orphanedSells: OrphanedSell[]
}

// 取引を再生するときの並び順。
//
// 平均取得単価法は取引の順序で結果が変わる（同一日に BUY と SELL があると、
// どちらを先に処理するかで平均取得単価と実現損益が変わる）。一方 transactionDate は
// 取引フォームが日付だけを受け取るため時刻を持たず、同一日の取引はすべて同値になる。
// 約定の前後関係を復元できる情報が他に無いので、登録順（id の昇順）を採用する。
// 再生に関わるクエリはすべてこの順序を使い、日付だけで並べない。
export const TRANSACTION_REPLAY_ORDER = [
  { transactionDate: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.TransactionOrderByWithRelationInput[]

// 再生に必要な取引の最小形。Prisma の Decimal を number に落とした値を渡す。
export interface ReplayTransaction {
  id: number
  transactionType: 'BUY' | 'SELL'
  shares: number
  pricePerShare: number
  fee: number
  transactionDate: Date
}

export interface ReplayResult {
  shares: number
  costBasis: number
  realizedProfitLoss: number
  lastPurchaseDate: Date | null
  lastSaleDate: Date | null
  orphanedSells: OrphanedSell[]
}

// 平均取得単価法で取引履歴を再生する（ADR 0003）。
// DB に触れない純粋関数。日付順に並んでいることを前提とする。
export function replayTransactions(transactions: ReplayTransaction[]): ReplayResult {
  let shares = 0
  let costBasis = 0
  let realizedProfitLoss = 0
  let lastPurchaseDate: Date | null = null
  let lastSaleDate: Date | null = null
  const orphanedSells: OrphanedSell[] = []

  for (const tx of transactions) {
    if (tx.transactionType === 'BUY') {
      costBasis += tx.shares * tx.pricePerShare + tx.fee
      shares += tx.shares
      lastPurchaseDate = tx.transactionDate
    } else if (tx.transactionType === 'SELL') {
      if (shares <= 0) {
        // 取得原価が無く損益を計算できない。集計からは外すが、黙って捨てず記録して返す
        orphanedSells.push({
          transactionId: tx.id,
          transactionDate: tx.transactionDate,
          shares: tx.shares,
        })
        continue
      }
      const avgPrice = costBasis / shares
      const sellShares = Math.min(tx.shares, shares)
      realizedProfitLoss += (tx.pricePerShare - avgPrice) * sellShares - tx.fee
      costBasis -= avgPrice * sellShares
      shares -= sellShares
      lastSaleDate = tx.transactionDate
      if (shares <= 0) {
        shares = 0
        costBasis = 0
      }
    }
  }

  return { shares, costBasis, realizedProfitLoss, lastPurchaseDate, lastSaleDate, orphanedSells }
}

// 保有株数ゼロの時点に SELL が置かれている状態を表すエラー。
// 取引の登録・編集・削除の各ルートで捕捉し、400 として差し戻す。
export class TransactionOrderError extends Error {
  readonly orphanedSells: OrphanedSell[]

  constructor(orphanedSells: OrphanedSell[]) {
    const dates = orphanedSells
      .map((s) => formatDateKey(s.transactionDate))
      .join(', ')
    super(
      `保有株数が 0 の時点に売却が存在するため、実現損益を計算できません（対象日: ${dates}）。` +
        `売却より前に購入が来るよう取引日を見直してください。`,
    )
    this.name = 'TransactionOrderError'
    this.orphanedSells = orphanedSells
  }
}

// 再計算結果に孤立した SELL があれば例外を投げる。
// prisma.$transaction 内で呼べばロールバックされ、不整合な状態が確定しない。
export function assertNoOrphanedSells(result: RecalculationResult): void {
  if (result.orphanedSells.length > 0) {
    throw new TransactionOrderError(result.orphanedSells)
  }
}

// 平均取得単価法で Transaction から Stock 集計値を再計算する。
// Source of truth は Transaction（ADR 0003）。
//
// 戻り値の orphanedSells には、保有株数ゼロの時点に置かれていて集計に算入できなかった
// SELL を列挙する。集計自体は残りの取引で最後まで実行するため、呼び出し側が
// assertNoOrphanedSells で弾くか、無視して確定させるかを選べる。
export async function recalculateStockAggregates(
  stockId: number,
  client: PrismaClientOrTx = prisma,
): Promise<RecalculationResult> {
  const [stock, transactions] = await Promise.all([
    client.stock.findUnique({ where: { id: stockId } }),
    client.transaction.findMany({
      where: { stockId },
      orderBy: TRANSACTION_REPLAY_ORDER,
    }),
  ])

  if (!stock) return { orphanedSells: [] }

  const { shares, costBasis, realizedProfitLoss, lastPurchaseDate, lastSaleDate, orphanedSells } =
    replayTransactions(
      transactions.map((tx) => ({
        id: tx.id,
        transactionType: tx.transactionType,
        shares: Number(tx.shares),
        pricePerShare: Number(tx.pricePerShare),
        fee: Number(tx.fee),
        transactionDate: tx.transactionDate,
      })),
    )

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

  return { orphanedSells }
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
