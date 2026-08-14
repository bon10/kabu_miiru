# 取引エンティティ（Transaction）

## 参照元要件
- [機能要件概要](../1-requirements/0-overview.md)
- [取引履歴管理機能要件](../1-requirements/transaction-management.md)
- [銘柄一覧機能要件](../1-requirements/stock-management.md)

## エンティティ概要

株式の**売買（BUY / SELL）**取引の詳細記録を管理するエンティティ。売買を時系列で記録し、保有株数・投資額・実現損益の Source of Truth となる（ADR 0003）。

> **配当は本エンティティに含めない。** 受動的に受け取る配当は独立エンティティ `DividendHistory` に記録する（[ADR 0002](../7-adr/0002-dividend-as-separate-entity.md)）。受取配当の金額算出（1株あたり配当金 × 保有株数）は [ADR 0007](../7-adr/0007-dividend-receipt-amount-from-per-share.md) / [BR-202](business-rules.md) を参照。

## フィールド定義

### 基本情報
| フィールド名 | 型 | 必須 | 説明 |
|---|---|---|---|
| id | INT | ○ | システム内部ID |
| stockId | INT | ○ | 対象銘柄ID（外部キー） |
| transactionType | ENUM | ○ | 取引種別 |
| transactionDate | DATETIME | ○ | 取引日 |
| createdAt | DATETIME | ○ | 記録作成日時 |

### 取引詳細
| フィールド名 | 型 | 必須 | 説明 |
|---|---|---|---|
| shares | DECIMAL(15,4) | ○ | 取引株数 |
| pricePerShare | DECIMAL(15,4) | ○ | 1株あたり価格 |
| totalAmount | DECIMAL(15,2) | ○ | 取引総額 |
| fee | DECIMAL(15,2) | ○ | 手数料（デフォルト：0） |
| memo | STRING | - | メモ・備考 |

## ENUM定義

### TransactionType（取引種別）
- `BUY`: 購入取引
- `SELL`: 売却取引

> `DIVIDEND` は ADR 0002 により本 enum から削除済み（配当は `DividendHistory`）。現行スキーマの `TransactionType` は `BUY` / `SELL` の 2 値。

## 取引種別詳細

### BUY（購入取引）
- **用途**: 株式の新規購入・追加購入
- **影響**: 保有株数増加、投資額増加
- **計算**: totalAmount = shares × pricePerShare + fee

### SELL（売却取引）
- **用途**: 保有株式の売却
- **影響**: 保有株数減少、実現損益発生
- **計算**: totalAmount = shares × pricePerShare - fee

## ビジネスルール

### BR-010: 取引整合性
- **売却制約**: 売却株数 ≤ 売却時点の保有株数
- **購入制約**: 購入株数 > 0、購入単価 > 0

### BR-011: 金額計算
```
// 購入時
totalAmount = shares × pricePerShare + fee
investmentAmount += totalAmount

// 売却時  
totalAmount = shares × pricePerShare - fee
realizedProfitLoss = totalAmount - (avgAcquisitionPrice × shares)
```

### BR-012: 保有株数更新
```
// 購入時
newSharesHeld = currentSharesHeld + shares

// 売却時
newSharesHeld = currentSharesHeld - shares
```

### BR-013: 平均取得単価更新
```
// 購入時（追加購入の場合）
newAvgPrice = (currentInvestment + totalAmount) ÷ newSharesHeld

// 売却時（平均取得単価は変更なし）
avgAcquisitionPrice = currentAvgPrice
```

## データ整合性規則

### DR-001: 時系列整合性
- **制約**: 取引日は論理的な順序を保つ
- **チェック**: 初回購入日 ≤ 追加購入日 ≤ 売却日

### DR-002: 保有株数整合性
- **計算式**: Stock.sharesHeld = Σ(BUY.shares) - Σ(SELL.shares)
- **チェック**: 取引追加・編集時の自動検証

### DR-003: 投資額整合性
- **計算式**: Stock.investmentAmount = Σ(BUY.totalAmount)
- **調整**: 売却時は投資額から対応分を減額

## リレーション

### N:1 リレーション
- **Stock**: 複数の取引が1つの銘柄に属する
- **外部キー**: stockId → Stock.id
- **削除制約**: カスケード削除

## インデックス設計

### パフォーマンス最適化
- **主キー**: id（自動）
- **外部キー**: stockId
- **複合インデックス**: (stockId, transactionDate) 
- **検索最適化**: transactionType, transactionDate

## バリデーション規則

### VR-001: 必須項目検証
- stockId, transactionType, shares, pricePerShare, transactionDate

### VR-002: 数値検証
- shares > 0
- pricePerShare > 0
- totalAmount >= 0
- fee >= 0

### VR-003: 論理検証
- 売却時: 対象銘柄の保有株数 >= 売却株数
- 日付: transactionDate <= 現在日時
- 銘柄存在: stockIdが有効な銘柄を参照

## 取引例

### 購入取引例
```json
{
  "stockId": 1,
  "transactionType": "BUY", 
  "shares": 100,
  "pricePerShare": 2500.00,
  "totalAmount": 250000,
  "fee": 500,
  "transactionDate": "2024-01-15",
  "memo": "新規購入"
}
```

### 売却取引例
```json
{
  "stockId": 1,
  "transactionType": "SELL",
  "shares": 50, 
  "pricePerShare": 2800.00,
  "totalAmount": 139500,
  "fee": 500,
  "transactionDate": "2024-06-15",
  "memo": "利益確定売り"
}
```

> 配当受取の記録例は `DividendHistory` 側にあたる（本エンティティでは扱わない）。[ADR 0002](../7-adr/0002-dividend-as-separate-entity.md) / [ADR 0007](../7-adr/0007-dividend-receipt-amount-from-per-share.md) を参照。