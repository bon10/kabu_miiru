import { PrismaClient } from '@prisma/client'

// ローカル MySQL から本番 DB（TiDB Cloud）へのデータ移送（ADR 0013）。
//
// 移送するのは人手で入力した原資料だけにする。日次終値（DailyPrice）と日次
// USD/JPY レート（ExchangeRate）は Yahoo Finance から取り直せるうえ、ローカルの
// 既存レコードは日付が 1 日前にずれているため（ADR 0012）、運び込まずに移送後の
// バッチで入れ直す。
//
//   pnpm db:push で移送先にスキーマを作る
//     ↓
//   このスクリプトで銘柄・取引・配当などを運ぶ
//     ↓
//   POST /api/batch/daily-close {"range":"2y"} で日次終値とレートを入れ直す
//
// id を保ったまま挿入する。Transaction.stockId などの参照をそのまま使うため。
//
// 使い方（stock-portfolio-app ディレクトリで実行）:
//   SOURCE_DATABASE_URL='mysql://...localhost:3406/stock_portfolio' \
//   TARGET_DATABASE_URL='mysql://...tidbcloud.com:4000/stock_portfolio?sslaccept=strict' \
//   node scripts/migrate-to-remote-db.js            # 件数の確認のみ（dry-run）
//
//   同上 node scripts/migrate-to-remote-db.js --apply   # 実際に書き込む

// 移送するテーブル。親から子の順に並べる（外部キーの参照先を先に作るため）。
//
// dateColumns には暦日を表す列を挙げる。これらは DATE 型なので時刻を持たないが、
// 型を変える前に取ったダンプから移送する場合に備えて、移送時にも時刻を揃える
// （後述の normalizeDateColumns。揃っていれば何もしない）。
const TABLES = [
  { model: 'broker', label: '証券会社', dateColumns: [] },
  {
    model: 'stock',
    label: '銘柄',
    dateColumns: ['firstPurchaseDate', 'purchaseDate', 'saleDate'],
  },
  { model: 'transaction', label: '取引', dateColumns: ['transactionDate'] },
  { model: 'dividendHistory', label: '配当', dateColumns: ['paymentDate'] },
  { model: 'priceHistory', label: '価格履歴', dateColumns: [] },
  { model: 'setting', label: 'アプリ設定', dateColumns: [] },
]

// 移送せず、移送後にバッチで入れ直すテーブル。
const REFETCHED_TABLES = [
  { model: 'dailyPrice', label: '日次終値' },
  { model: 'exchangeRate', label: '日次 USD/JPY レート' },
]

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`環境変数 ${name} を指定してください`)
  }
  return value
}

// 接続先を取り違えたまま書き込まないよう、ホストとデータベース名だけ表示する。
function describeUrl(url) {
  const { host, pathname } = new URL(url)
  return `${host}${pathname}`
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 時刻を、その時刻が属する日本時間の暦日（世界標準時 0 時）に丸める。
// src/lib/date-key.ts の toDateKey と同じ計算。このスクリプトは素の Node で
// 動かすため TypeScript の実装を import できず、ここに再掲している。
function toDateKey(date) {
  return new Date(Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS) * DAY_MS)
}

// 暦日カラムの時刻を揃える。
//
// これらの列は DATE 型なので、通常は既に世界標準時 0 時で返り、この関数は
// 何もしない。DATE 型へ移す前のデータを移送元にした場合だけ、時刻を揃える。
// toDateKey を通した結果は変換の前後で同じなので、暦日は変わらない。
function normalizeDateColumns(row, columns) {
  let changed = false
  const normalized = { ...row }
  for (const column of columns) {
    const value = row[column]
    if (!(value instanceof Date)) continue
    const key = toDateKey(value)
    if (key.getTime() !== value.getTime()) {
      normalized[column] = key
      changed = true
    }
  }
  return { row: normalized, changed }
}

async function migrate(apply, force) {
  const sourceUrl = requireEnv('SOURCE_DATABASE_URL')
  const targetUrl = requireEnv('TARGET_DATABASE_URL')

  if (sourceUrl === targetUrl) {
    throw new Error('移送元と移送先が同じです')
  }

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } })
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } })

  console.log(`移送元: ${describeUrl(sourceUrl)}`)
  console.log(`移送先: ${describeUrl(targetUrl)}`)
  console.log('')

  try {
    // 二重投入を防ぐ。移送先に銘柄が 1 件でもあれば、続けると id が衝突するか
    // 重複データになるため、意図的な上書き（--force）でなければ止める。
    const existingStocks = await target.stock.count()
    if (existingStocks > 0 && !force) {
      throw new Error(
        `移送先に銘柄が ${existingStocks} 件あります。` +
          '入れ直す場合は移送先を空にするか --force を付けてください',
      )
    }

    for (const { model, label, dateColumns } of TABLES) {
      const rows = await source[model].findMany()
      if (rows.length === 0) {
        console.log(`${label}（${model}）: 0 件 — 移送なし`)
        continue
      }

      let normalizedCount = 0
      const data = rows.map((row) => {
        const { row: normalized, changed } = normalizeDateColumns(row, dateColumns)
        if (changed) normalizedCount += 1
        return normalized
      })
      const note = normalizedCount > 0 ? `（うち ${normalizedCount} 件は日付の時刻を揃える）` : ''

      if (!apply) {
        console.log(`${label}（${model}）: ${rows.length} 件を移送予定${note}`)
        continue
      }

      // 既に同じ id がある行は飛ばす。--force での再実行を安全にするため。
      const created = await target[model].createMany({ data, skipDuplicates: true })
      console.log(`${label}（${model}）: ${rows.length} 件中 ${created.count} 件を移送${note}`)
    }

    console.log('')
    for (const { model, label } of REFETCHED_TABLES) {
      const count = await source[model].count()
      console.log(`${label}（${model}）: ${count} 件 — 移送しない（移送後にバッチで取り直す）`)
    }

    console.log('')
    if (apply) {
      console.log('完了。続けて日次終値とレートを入れ直してください:')
      console.log(
        '  curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \\',
      )
      console.log('       -d \'{"range":"2y"}\' {本番URL}/api/batch/daily-close')
    } else {
      console.log('書き込むには --apply を付けて再実行してください')
    }
  } finally {
    await source.$disconnect()
    await target.$disconnect()
  }
}

migrate(process.argv.includes('--apply'), process.argv.includes('--force')).catch((error) => {
  console.error('❌ データ移送に失敗しました:', error.message ?? error)
  process.exitCode = 1
})
