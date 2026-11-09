import { prisma } from '@/lib/prisma'
import { getApiSymbol } from '@/lib/utils'

// 銘柄のセクター（Stock.marketSector）を Yahoo Finance の分類で埋める（ADR 0017）。
//
// 分類は GICS ではなく Yahoo 独自の 11 分類をそのまま使う。GICS を無料で
// 取得できる経路が無く、Yahoo の名前を GICS に読み替えても銘柄の振り分けは
// Yahoo のままで正確にならないため。Yahoo は ETF にセクターを返さないので、
// ETF は "ETF" として扱う。
//
// 手入力の自由記述は上書きする。分野別に保有を集計するには、値が決まった
// 分類に揃っている必要があるため。

// https://finance.yahoo.com/sectors/ の一覧（2026-11-09 に確認）
export const YAHOO_SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Real Estate',
  'Technology',
  'Utilities',
] as const

export const ETF_SECTOR = 'ETF'

const KNOWN_SECTORS = new Set<string>([...YAHOO_SECTORS, ETF_SECTOR])

/**
 * Yahoo に問い合わせる必要があるか。
 * 既に Yahoo の分類（か ETF）が入っている銘柄は、セクターがめったに変わらない
 * ので問い合わせない。
 */
export function shouldFetchSector(marketSector: string | null): boolean {
  return !marketSector || !KNOWN_SECTORS.has(marketSector)
}

/**
 * quoteSummary（modules=assetProfile,quoteType）のレスポンスからセクターを取り出す。
 * 取り出せなければ null。
 */
export function parseSector(payload: unknown): string | null {
  const result = (payload as {
    quoteSummary?: {
      result?: Array<{
        quoteType?: { quoteType?: string }
        assetProfile?: { sector?: string }
      }> | null
    }
  })?.quoteSummary?.result?.[0]
  if (!result) return null

  if (result.quoteType?.quoteType === 'ETF') return ETF_SECTOR
  return result.assetProfile?.sector || null
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// quoteSummary は価格取得の chart エンドポイントと違い、Cookie と crumb が
// 無いと 401（Invalid Crumb）を返す（2026-11-09 に実測。非公式 API のため仕様の
// 保証は無い）。fc.yahoo.com で Cookie を受け取り、それを付けて crumb を得る。
// 同じプロセス内では使い回し、401 が返ったら取り直す。
let yahooSession: { cookie: string; crumb: string } | null = null

async function getYahooSession(): Promise<{ cookie: string; crumb: string }> {
  if (yahooSession) return yahooSession

  const cookieResponse = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  })
  const cookie = cookieResponse.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

  const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
  })
  if (!crumbResponse.ok) {
    throw new Error(`crumb の取得に失敗しました（HTTP ${crumbResponse.status}）`)
  }

  yahooSession = { cookie, crumb: await crumbResponse.text() }
  return yahooSession
}

async function fetchSector(code: string): Promise<string | null> {
  const apiSymbol = getApiSymbol(code)

  for (let attempt = 0; attempt < 2; attempt++) {
    const { cookie, crumb } = await getYahooSession()
    const url =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(apiSymbol)}` +
      `?modules=assetProfile,quoteType&crumb=${encodeURIComponent(crumb)}`

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
    })
    if (response.status === 401) {
      yahooSession = null
      continue
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return parseSector(await response.json())
  }

  throw new Error('crumb を取り直しても 401 が返りました')
}

/**
 * 必要なら Yahoo からセクターを取得して保存する。
 * 価格更新のついでに呼ばれるため、失敗しても例外を投げずにログだけ残す
 * （セクターが取れないことを理由に価格更新を失敗扱いにしない）。
 */
export async function updateSectorIfNeeded(stock: {
  id: number
  code: string
  marketSector: string | null
}): Promise<void> {
  if (!shouldFetchSector(stock.marketSector)) return

  try {
    const sector = await fetchSector(stock.code)
    if (!sector) return
    await prisma.stock.update({
      where: { id: stock.id },
      data: { marketSector: sector },
    })
  } catch (error) {
    console.error(`Failed to update sector for ${stock.code}:`, error)
  }
}
