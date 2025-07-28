# データベース設計 - 概要

## 参照元設計

このデータベース設計は以下の設計文書に基づいています：

- [ドメインモデル概要](../2-domain/0-overview.md)
- [株式エンティティ](../2-domain/stock-entity.md)
- [取引エンティティ](../2-domain/transaction-entity.md)
- [ビジネスルール](../2-domain/business-rules.md)

## 設計方針

### 物理設計原則

- **ドメイン駆動**: ドメインモデルの忠実な実装
- **パフォーマンス重視**: 適切なインデックス設計
- **データ整合性**: 制約による品質保証
- **スケーラビリティ**: 将来的な拡張に対応

### データベース技術選定

- **MySQL 8.0**: 本番環境での実績と信頼性
- **Prisma ORM**: TypeScript統合とマイグレーション管理
- **ACID準拠**: トランザクションによるデータ整合性

## 実装場所

### スキーマ定義

```
stock-portfolio-app/prisma/schema.prisma
```

このファイルが唯一の信頼できるソース（Single Source of Truth）として機能します。

### 設計の特徴

- **TSV完全対応**: 提供TSVファイルの20列に完全対応
- **型安全性**: Prismaによる自動型生成
- **マイグレーション**: スキーマ変更の履歴管理

## 主要テーブル

### Stock（株式マスタ）

- **目的**: 銘柄情報の中核テーブル
- **特徴**: TSVファイルの全カラムに対応
- **関連**: 全ての取引・履歴データの基点

### Transaction（取引履歴）

- **目的**: 売買・配当取引の完全な記録
- **特徴**: 時系列データの整合性保証
- **関連**: Stockテーブルとの1:N関係

### PriceHistory（価格履歴）

- **目的**: 株価の時系列データ保存
- **特徴**: 市場セッション別の管理
- **用途**: チャート表示・分析機能

### DividendHistory（配当履歴）

- **目的**: 配当支払い履歴の管理
- **特徴**: 配当種別（期末・中間・特別）対応
- **関連**: 配当分析機能の基礎データ

### PortfolioSummary（サマリーキャッシュ）

- **目的**: 集計データの高速化
- **特徴**: 計算済みサマリーの保存
- **用途**: ダッシュボード表示の最適化

## データ整合性戦略

### 参照整合性

```sql
-- 外部キー制約による関連性保証
FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
```

### 制約による品質保証

```sql
-- 値制約による論理的整合性
CHECK (shares_held >= 0)
CHECK (avg_acquisition_price > 0 OR shares_held = 0)
```

### 一意性制約

```sql
-- ビジネス上の一意性保証
UNIQUE (code) -- 銘柄コードの重複防止
```

## インデックス戦略

### パフォーマンス最適化

```sql
-- 検索パフォーマンス向上
INDEX idx_stock_holding_company (holding_company)
INDEX idx_stock_market (market)
INDEX idx_transaction_stock_date (stock_id, transaction_date)
```

### 複合インデックス

```sql
-- 複合検索の最適化
INDEX idx_stock_held_company (shares_held, holding_company)
INDEX idx_price_stock_recorded (stock_id, recorded_at)
```

## ENUM定義

### TransactionType

- `BUY`: 購入取引
- `SELL`: 売却取引
- `DIVIDEND`: 配当受取

### PriceUpdateStatus

- `SUCCESS`: 更新成功
- `ERROR`: 更新失敗
- `PENDING`: 更新待機中

### MarketSession

- `MORNING`: 前場
- `AFTERNOON`: 後場
- `AFTER_HOURS`: 時間外

## 精度・型定義

### 金額・価格の精度

```sql
-- 高精度な金額管理
DECIMAL(15,2)  -- 金額（投資額、損益等）
DECIMAL(15,4)  -- 価格（株価、取得単価等）
DECIMAL(8,4)   -- 率（損益率、配当利回り等）
```

### 文字列サイズ

```sql
VARCHAR(100)   -- 銘柄名、会社名
VARCHAR(10)    -- 銘柄コード
TEXT           -- メモ、エラー内容
```

## マイグレーション管理

### Prismaマイグレーション

```bash
# スキーマ変更の適用
pnpm dlx prisma db push

# マイグレーションファイル生成
pnpm dlx prisma migrate dev --name add_new_feature

# 本番環境適用
pnpm dlx prisma migrate deploy
```

### バージョン管理

- **開発**: `prisma db push` で迅速な反映
- **本番**: `prisma migrate` で確実な変更管理
- **履歴**: マイグレーションファイルでの変更追跡

## パフォーマンス考慮

### クエリ最適化

- **N+1問題回避**: Prismaの `include` 適切な使用
- **バッチ処理**: 大量データ更新の効率化
- **接続プール**: 同時接続数の管理

### キャッシュ戦略

- **アプリケーション層**: SWRによるクライアントキャッシュ
- **データベース層**: MySQL クエリキャッシュ
- **サマリーテーブル**: 計算済みデータの保存

## セキュリティ対策

### アクセス制御

- **認証**: 現在は認証なし（単一ユーザー想定）
- **将来対応**: NextAuth.js による認証・認可
- **監査**: 重要操作のログ記録

### データ保護

- **暗号化**: 機密データの暗号化保存
- **バックアップ**: 定期的なデータバックアップ
- **復旧**: 障害時のデータ復旧手順

## 開発・運用

### 開発環境

- **Docker**: 一貫した開発環境
- **Seed**: 開発用テストデータ（将来実装）
- **Studio**: Prisma Studio によるデータ確認

### 監視・メンテナンス

- **パフォーマンス監視**: スロークエリの検出
- **容量監視**: ディスク使用量の管理
- **定期メンテナンス**: インデックス最適化

## 関連ドキュメント

- **実装**: [schema.prisma](../../prisma/schema.prisma) - 実際のスキーマ定義
- **API連携**: [API仕様](../6-api-spec/api-spec.yaml) - データベースとAPIの対応関係
