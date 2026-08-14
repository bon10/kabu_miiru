# 外部API連携仕様

## 概要

株みーるアプリでは、株価データの取得のために外部APIを使用しています。現在はYahoo Finance APIをメインとし、将来的に楽天RSSなどの補完APIの追加を予定しています。株価に加え、米国株を円換算するための USD/JPY 為替レートも Yahoo Finance から取得します。

## Yahoo Finance API

### 基本情報

- **API種別**: 非公式API（無料）
- **認証**: APIキー不要
- **ベースURL**: `https://query1.finance.yahoo.com`
- **レート制限**: 1分間に100リクエスト（仕様値）
- **データ精度**: リアルタイム（一部15分遅延）

### エンドポイント

#### 株価取得API

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
```

**パラメータ**:

- `symbol`: 銘柄コード
  - 日本株: `7203.T` (トヨタ自動車)
  - 米国株: `AAPL` (Apple)

**リクエスト例**:

```bash
curl "https://query1.finance.yahoo.com/v8/finance/chart/7203.T" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

**レスポンス例**:

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "currency": "JPY",
          "symbol": "7203.T",
          "regularMarketPrice": 2850.0,
          "previousClose": 2840.0,
          "regularMarketChange": 10.0,
          "regularMarketChangePercent": 0.352,
          "regularMarketTime": 1642752000,
          "regularMarketDayHigh": 2860.0,
          "regularMarketDayLow": 2830.0,
          "regularMarketVolume": 1234567
        },
        "timestamp": [1642752000],
        "indicators": {
          "quote": [
            {
              "open": [2845.0],
              "high": [2860.0],
              "low": [2830.0],
              "close": [2850.0],
              "volume": [1234567]
            }
          ]
        }
      }
    ],
    "error": null
  }
}
```

#### 日次終値の取得（range / interval）

ポートフォリオ推移（[ADR 0008](7-adr/0008-portfolio-timeline-from-daily-close.md)）で使う**過去の日次終値**は、同じ chart エンドポイントに `range` と `interval` を付けて取得する。

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d
```

**リクエスト例**:

```bash
curl "https://query1.finance.yahoo.com/v8/finance/chart/7203.T?range=1mo&interval=1d" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

終値は `chart.result[0].indicators.quote[0].close`、対応する日付は `chart.result[0].timestamp`（UNIX 秒）に**同じ長さの配列**で入る。

> **確認方法と限界**：Yahoo Finance は非公式 API であり公式ドキュメントが存在しない。ここに書いた挙動は 2026-08-14 に上記リクエストを実行し、1 レスポンスに 22 営業日分の終値が含まれることを実測して確認したものである。**仕様として保証されたものではなく、予告なく変わりうる**。ADR 0008 の見直しトリガーにこの前提が崩れた場合を含めている。

**設計上の含意**：期間分が 1 リクエストで返るため、**アプリを止めていた期間も後から一括で埋められる**。1 ヶ月の欠測でも 1 日ぶんの更新でも、55 銘柄に対するリクエスト数は同じ 55 回で変わらない。この性質が「保存するのは日次終値という原資料だけ」という ADR 0008 の設計を成立させている。

なお [fetchMultipleStockPrices](../src/lib/stock-price.ts) は銘柄を**直列**で処理するため、バックフィルは画面リクエストからではなくバッチ経路で実行する。

### 実装詳細

#### 銘柄コード変換

```typescript
function getApiSymbol(symbol: string): string {
  // 日本株の場合、.Tサフィックスを追加
  if (/^\d+$/.test(symbol)) {
    return `${symbol}.T`
  }
  // 米国株はそのまま
  return symbol
}
```

#### API呼び出し実装

```typescript
async function fetchFromYahooFinance(symbol: string): Promise<any | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    if (!data.chart?.result?.[0]?.meta) {
      throw new Error('Invalid response format')
    }

    return data.chart.result[0].meta
  } catch (error) {
    console.error(`Yahoo Finance API error for ${symbol}:`, error)
    return null
  }
}
```

### エラーハンドリング

#### 一般的なエラー

1. **HTTP 404**: 銘柄コードが存在しない
2. **HTTP 429**: レート制限に達した
3. **HTTP 500**: Yahoo側のサーバーエラー
4. **ネットワークエラー**: 接続失敗

#### エラー対応策

```typescript
async function fetchStockPriceWithRetry(
  symbol: string,
  maxRetries = 3
): Promise<StockPrice | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchFromYahooFinance(symbol)
      if (result) return result
    } catch (error) {
      console.warn(`Attempt ${attempt} failed for ${symbol}:`, error)

      if (attempt < maxRetries) {
        // 指数バックオフで再試行
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }
  }

  // 全ての試行が失敗した場合、モックデータを返す
  return generateMockPriceData(symbol)
}
```

### レート制限対策

#### 並列処理制限

```typescript
import pLimit from 'p-limit'

const limit = pLimit(10) // 最大10並列

async function fetchMultipleStockPrices(
  symbols: string[]
): Promise<PriceUpdateResult[]> {
  const promises = symbols.map((symbol) => limit(() => fetchStockPrice(symbol)))

  return Promise.all(promises)
}
```

#### リクエスト間隔制御

```typescript
async function fetchWithDelay(
  symbol: string,
  delay = 100
): Promise<StockPrice | null> {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return fetchStockPrice(symbol)
}
```

## USD/JPY 為替レート

米国株はドル建てで取得・保存されるため、円換算用に USD/JPY レートを取得します（ADR 0005）。株価と同じ Yahoo Finance のチャートエンドポイントを、為替シンボル `USDJPY=X` に対して呼び出します。

### 為替レート取得の基本情報

- **エンドポイント**: `GET https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X`
- **認証**: APIキー不要（株価と同じ非公式API）
- **取得値**: `chart.result[0].meta.regularMarketPrice`（1 USD あたりの JPY。取得不可時は `previousClose` にフォールバック）
- **更新頻度**: 1 日 1 回。当日のレートを `ExchangeRate` テーブル（`rateDate` ユニーク）にキャッシュし、当日レコードがあれば再取得しない
- **フォールバック**: Yahoo 取得に失敗した場合は、保存済みの最新レートを使用する

### 為替レートのレスポンス例

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "currency": "JPY",
          "symbol": "USDJPY=X",
          "regularMarketPrice": 161.31,
          "previousClose": 161.09
        }
      }
    ]
  }
}
```

### 為替レートの実装

- 取得・キャッシュ：[getCurrentUsdJpyRate](../../src/lib/exchange-rate.ts)（`ExchangeRate` テーブルに日次保存。ダッシュボードは複数 API を並行で叩くため、当日レコードが無い初回の同時作成はユニーク制約の衝突を捕捉して読み直す）
- 円換算：[toJpy](../../src/lib/currency.ts)（`market === '米国'` の金額のみレートを掛ける）
- 単価の建値通貨表示：[formatPrice](../../src/lib/utils.ts)

### 為替レートの注意点

- 取得原価も評価額も**当日レート**で換算するため、損益に**為替損益は含まれない**（ADR 0005）。購入時レートを記録できるようになれば、取得原価だけ購入時レートで換算する方式に拡張する

## 楽天RSS API（将来実装）

### 基本情報

- **対象**: 地方証券所銘柄（名証、福証等）
- **用途**: Yahoo Financeで取得できない銘柄の補完
- **認証**: 要調査
- **制限**: 要調査

### 実装予定

```typescript
async function fetchFromRakutenRSS(symbol: string): Promise<StockPrice | null> {
  // 実装予定
  throw new Error('Not implemented yet')
}
```

## モックデータ生成

### 用途

- API取得失敗時のフォールバック
- 開発環境でのテスト
- デモンストレーション

### 実装

```typescript
function generateMockPriceData(symbol: string): StockPrice {
  const basePrice = symbol.length * 100 + Math.random() * 1000
  const variation = (Math.random() - 0.5) * 0.1 // ±5%の変動
  const currentPrice = Math.round(basePrice * (1 + variation))
  const previousClose = Math.round(currentPrice * (0.95 + Math.random() * 0.1))
  const change = currentPrice - previousClose
  const changePercent = (change / previousClose) * 100

  return {
    symbol,
    currentPrice,
    previousClose,
    change,
    changePercent,
    lastUpdate: new Date(),
  }
}
```

## 市場セッション判定

### セッション種別

```typescript
type MarketSession = 'morning' | 'afternoon' | 'after_hours'

function getCurrentMarketSession(): MarketSession {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const timeInMinutes = hour * 60 + minute

  // 前場: 9:00-11:30
  if (timeInMinutes >= 540 && timeInMinutes <= 690) {
    return 'morning'
  }

  // 後場: 12:30-15:00
  if (timeInMinutes >= 750 && timeInMinutes <= 900) {
    return 'afternoon'
  }

  return 'after_hours'
}
```

## パフォーマンス最適化

### キャッシュ戦略

```typescript
const priceCache = new Map<string, { data: StockPrice; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5分

async function fetchStockPriceWithCache(
  symbol: string
): Promise<StockPrice | null> {
  const cached = priceCache.get(symbol)

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }

  const freshData = await fetchStockPrice(symbol)

  if (freshData) {
    priceCache.set(symbol, {
      data: freshData,
      timestamp: Date.now(),
    })
  }

  return freshData
}
```

### バッチ処理最適化

```typescript
async function batchUpdatePrices(
  stockIds: number[]
): Promise<PriceUpdateResult[]> {
  const stocks = await prisma.stock.findMany({
    where: { id: { in: stockIds } },
    select: { id: true, code: true },
  })

  const results: PriceUpdateResult[] = []

  // 10件ずつバッチ処理
  for (let i = 0; i < stocks.length; i += 10) {
    const batch = stocks.slice(i, i + 10)
    const batchResults = await Promise.all(
      batch.map(async (stock) => {
        const priceData = await fetchStockPrice(stock.code)

        if (priceData) {
          await prisma.stock.update({
            where: { id: stock.id },
            data: {
              currentPrice: priceData.currentPrice,
              lastPriceUpdate: new Date(),
              priceUpdateStatus: 'SUCCESS',
            },
          })
        }

        return {
          stockId: stock.id,
          symbol: stock.code,
          success: !!priceData,
          newPrice: priceData?.currentPrice,
          error: priceData ? undefined : '価格取得に失敗しました',
        }
      })
    )

    results.push(...batchResults)

    // バッチ間の待機時間
    if (i + 10 < stocks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return results
}
```

## 監視・ログ

### API呼び出しログ

```typescript
interface ApiCallLog {
  symbol: string
  endpoint: string
  status: 'success' | 'error'
  responseTime: number
  error?: string
  timestamp: Date
}

async function logApiCall(log: ApiCallLog): Promise<void> {
  console.log(`[API] ${log.symbol} - ${log.status} (${log.responseTime}ms)`)

  // 将来的にはデータベースやログサービスに保存
  // await saveToLogService(log)
}
```

### エラー通知

```typescript
async function notifyApiError(symbol: string, error: Error): Promise<void> {
  console.error(`[API ERROR] ${symbol}:`, error)

  // 将来的にはSlackやメール通知
  // await sendSlackNotification(`API error for ${symbol}: ${error.message}`)
}
```

## 設定管理

### 環境変数

```env
# Yahoo Finance API設定
YAHOO_FINANCE_RATE_LIMIT=100
YAHOO_FINANCE_TIMEOUT=10000
YAHOO_FINANCE_RETRY_COUNT=3

# 楽天RSS API設定（将来）
RAKUTEN_RSS_API_KEY=""
RAKUTEN_RSS_ENDPOINT=""

# モック設定
USE_MOCK_DATA=false
MOCK_PRICE_VARIATION=0.05
```

### 設定ファイル

```typescript
export const apiConfig = {
  yahooFinance: {
    baseUrl: 'https://query1.finance.yahoo.com',
    rateLimit: parseInt(process.env.YAHOO_FINANCE_RATE_LIMIT || '100'),
    timeout: parseInt(process.env.YAHOO_FINANCE_TIMEOUT || '10000'),
    retryCount: parseInt(process.env.YAHOO_FINANCE_RETRY_COUNT || '3'),
  },
  mock: {
    enabled: process.env.USE_MOCK_DATA === 'true',
    priceVariation: parseFloat(process.env.MOCK_PRICE_VARIATION || '0.05'),
  },
}
```
