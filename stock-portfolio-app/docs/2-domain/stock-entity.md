# 株式エンティティ（Stock）

## 参照元要件
- [機能要件概要](../1-requirements/0-overview.md)
- [銘柄一覧機能要件](../1-requirements/stock-management.md)
- [ポートフォリオサマリー機能要件](../1-requirements/portfolio-summary.md)

## エンティティ概要

TSVファイルの全20列に対応した株式情報のメインエンティティ。個別銘柄の全ての情報を保持し、ポートフォリオ管理の中核となる。

## フィールド定義

### 基本情報
| フィールド名 | 型 | 必須 | 説明 | TSV列対応 |
|---|---|---|---|---|
| id | INT | ○ | システム内部ID | - |
| no | INT | - | TSVファイルのNo列 | No |
| stockName | STRING | ○ | 銘柄名 | 銘柄名 |
| holdingCompany | STRING | ○ | 保有会社（証券会社） | 保有会社 |
| market | ENUM | ○ | 市場（国内/米国） | 市場 |
| code | STRING | ○ | 銘柄コード | コード |

### 保有・投資情報
| フィールド名 | 型 | 必須 | 説明 | TSV列対応 |
|---|---|---|---|---|
| sharesHeld | DECIMAL(15,4) | ○ | 保有株数 | 保有株数 |
| avgAcquisitionPrice | DECIMAL(15,4) | ○ | 平均取得単価 | 平均取得単価 |
| investmentAmount | DECIMAL(15,2) | ○ | 投資額 | 投資額 |
| currentPrice | DECIMAL(15,4) | ○ | 現在価格 | 現在価格 |
| profitLoss | DECIMAL(15,2) | ○ | 損益 | 損益 |
| profitLossRate | DECIMAL(8,4) | ○ | 損益率 | 損益率 |

### 配当情報
| フィールド名 | 型 | 必須 | 説明 | TSV列対応 |
|---|---|---|---|---|
| dividendPerShare | DECIMAL(10,4) | ○ | 1株配当金 | 1株配当金 |
| dividendYield | DECIMAL(8,4) | ○ | 配当利回り | 配当利回り |
| dividendAmount | DECIMAL(15,2) | ○ | 配当金額 | 配当金額 |

### 取引・管理情報
| フィールド名 | 型 | 必須 | 説明 | TSV列対応 |
|---|---|---|---|---|
| purchaseDate | DATETIME | - | 購入日 | 購入日 |
| saleDate | DATETIME | - | 売却日 | 売却日 |
| realizedProfitLoss | DECIMAL(15,2) | - | 実現損益 | 損益（売却時） |
| targetPrice | DECIMAL(15,4) | - | 目標価格 | 目標価格 |
| marketSector | STRING | - | 市場・セクター | 市場・セクター |
| purpose | STRING | - | 目的 | 目的 |

### システム管理情報
| フィールド名 | 型 | 必須 | 説明 |
|---|---|---|---|
| lastPriceUpdate | DATETIME | - | 最終価格更新日時 |
| priceUpdateStatus | ENUM | ○ | 価格更新ステータス |
| priceUpdateError | STRING | - | 価格更新エラー内容 |
| priceSource | STRING | - | 価格取得元 |
| createdAt | DATETIME | ○ | 作成日時 |
| updatedAt | DATETIME | ○ | 更新日時 |

## ENUM定義

### Market（市場）
- `国内`: 日本国内市場
- `米国`: 米国市場

### PriceUpdateStatus（価格更新ステータス）
- `SUCCESS`: 更新成功
- `ERROR`: 更新失敗
- `PENDING`: 更新待機中

## ビジネスルール

### BR-001: 銘柄コード形式
- **日本株**: 数字コード（例：7203）
- **米国株**: ティッカーシンボル（例：AAPL）
- **API呼び出し時**: 日本株は自動的に".T"サフィックス付加

### BR-002: 損益計算
```
損益 = (現在価格 × 保有株数) - 投資額
損益率 = 損益 ÷ 投資額 × 100
```

### BR-003: 配当金額計算
```
配当金額 = 1株配当金 × 保有株数
```

### BR-004: 売却済み判定
- **条件**: sharesHeld = 0 AND saleDate IS NOT NULL
- **用途**: 取引履歴での売却済み銘柄表示

## リレーション

### 1:N リレーション
- **Transaction**: 1つの銘柄に対して複数の取引記録
- **PriceHistory**: 1つの銘柄に対して複数の価格履歴
- **DividendHistory**: 1つの銘柄に対して複数の配当履歴

## 制約条件

### 一意性制約
- **code**: 銘柄コードは一意
- **複合キー**: (holdingCompany, code) の組み合わせで重複防止

### 値制約
- **sharesHeld**: >= 0
- **avgAcquisitionPrice**: > 0（保有株数 > 0の場合）
- **investmentAmount**: >= 0
- **currentPrice**: >= 0

### 参照整合性
- **Transaction.stockId**: Stock.id への外部キー
- **カスケード削除**: 銘柄削除時の関連データ処理

## データ変換仕様

### TSVインポート時
1. **数値変換**: カンマ区切りの数値を適切な型に変換
2. **日付変換**: YYYY-MM-DD形式からDATETIME型に変換
3. **NULL処理**: 空文字列をNULLに変換
4. **エンコーディング**: UTF-8での文字列処理

### API出力時
1. **小数点制御**: 金額は小数点以下2桁、価格は4桁
2. **日付形式**: ISO 8601形式での出力
3. **NULL処理**: フロントエンド用のデフォルト値設定