# CLAUDE.md

このファイルは、このリポジトリのコードを扱う際にClaude Code (claude.ai/code)へのガイダンスを提供します。

## プロジェクト概要

Next.js 15とApp Routerで構築された包括的な株式ポートフォリオ管理アプリケーション。ユーザーは複数の証券会社にわたる株式ポートフォリオを管理し、日本株と米国株の両方でリアルタイム株価を追跡し、投資パフォーマンスを分析できます。

## コマンド

**開発モード:**
```bash
pnpm dev
```

**ビルド:**
```bash
pnpm build
```

**依存関係のインストール:**
```bash
pnpm install
```

**データベース操作:**
```bash
pnpm db:generate            # Prismaクライアントの生成
pnpm db:push                # データベースへのスキーマ変更の反映
pnpm db:studio              # データベースGUIの起動
pnpm db:reset               # データベースのリセット
```

**Docker操作:**
```bash
docker-compose up -d        # MySQLコンテナをバックグラウンドで起動
docker-compose down         # 全サービスの停止
docker-compose logs mysql   # MySQLログの確認
```

**リンティングとフォーマット:**
```bash
pnpm lint
pnpm dlx prettier --write .
```

**テスト（Vitest）:**
```bash
pnpm test                   # 全テストを1回実行
pnpm test:watch             # 変更監視でループ実行（TDD用）
```
- 純粋ロジックは `src/lib` に抽出して単体テストする（例: `src/lib/dividend.ts` ↔ `src/lib/dividend.test.ts`）
- 設定は `vitest.config.mts`（node 環境・`@/` エイリアス）
- TDD の進め方は `.claude/skills/tdd` を参照

## アーキテクチャ

### 技術スタック
- **フロントエンド/バックエンド**: Next.js 15 (App Router) + TypeScript + React 19
- **データベース**: MySQL 8.0 + Prisma ORM
- **スタイリング**: Tailwind CSS 4.x + Radix UI + Lucide React
- **フォーム**: React Hook Form + Zod バリデーション
- **チャート**: Recharts
- **データフェッチング**: SWR
- **認証**: NextAuth.js（設定済み、実装準備完了）
- **パッケージマネージャー**: pnpm

### 主要ディレクトリ構造
- `src/app/` - Next.js App Routerページと APIルート
- `src/components/` - 再利用可能なReactコンポーネント
  - `ui/` - 基本UIコンポーネント（Button, Card, Table など）
  - `layout/` - レイアウトコンポーネント（Header など）
  - `portfolio/`, `transactions/` - 機能専用コンポーネント
- `src/lib/` - ユーティリティ関数と共通ロジック
- `src/types/` - TypeScript型定義
- `prisma/` - データベーススキーマ
- `docker/` - Docker設定ファイル

### データベーススキーマ
- **Stock**: 株式マスターデータ（TSVファイルの20フィールドに完全対応）
  - 基本情報、保有情報、投資情報、配当情報、価格更新情報
- **Transaction**: 売買・配当取引履歴
- **PriceHistory**: 価格履歴（市場セッション対応、場中の値を含む）
- **DailyPrice**: 日次終値（ポートフォリオ推移の原資料、`(stockId, priceDate)` ユニーク、ADR 0009）
- **ExchangeRate**: USD/JPY の日次レート（`rateDate` ユニーク、ADR 0005 / 0008）
- **DividendHistory**: 配当履歴
- **PortfolioSummary**: ポートフォリオサマリー（キャッシュ用）

## API機能

### 実装済みAPIエンドポイント

#### 株式管理 (`/api/stocks`)
- `GET /api/stocks` - 全株式の取得（フィルタリング・ソート対応）
- `POST /api/stocks` - 新規株式の追加
- `GET /api/stocks/[id]` - 特定株式の詳細取得
- `PUT /api/stocks/[id]` - 株式情報の更新
- `DELETE /api/stocks/[id]` - 株式の削除

#### 価格管理 (`/api/prices`)
- `POST /api/prices/update` - 株価の更新（一括・個別対応）
- `GET /api/prices/history/[stockId]` - 特定株式の価格履歴

#### ポートフォリオ分析 (`/api/portfolio`)
- `GET /api/portfolio/composition` - ポートフォリオ構成分析（株式・企業・市場別）
- `GET /api/portfolio/performance` - パフォーマンス指標
- `GET /api/portfolio/timeline` - 資産推移（評価額・投資元本・評価損益・累計配当。日次終値から読み取り時に再構成、ADR 0009）

#### バッチ (`/api/batch`) — `X-API-Key` 必須
- `POST /api/batch/price-update` - 現在価格の一括更新
- `POST /api/batch/daily-close` - 日次終値と日次 USD/JPY の取り込み（`{"range":"1mo"}`。既存は上書きせず再実行可）
- `POST /api/batch/initial-balance` - 初期残高 Transaction の生成（ADR 0008。既定は dry-run、`{"apply":true}` で実行）

#### 取引管理 (`/api/transactions`)
- `GET /api/transactions` - 取引履歴（ページング・フィルタ対応）
- `POST /api/transactions` - 新規取引の追加
- `GET /api/transactions/summary` - 取引統計サマリー

#### サマリー (`/api/summary`)
- `GET /api/summary` - 全体サマリー
- `GET /api/summary/by-company` - 企業別サマリー

#### データインポート (`/api/import`)
- `POST /api/import/tsv` - TSVファイルのインポート

## 実装済み主要機能

### 株価データ処理
- **日本株**: 数字コード（例："7203"）は自動的に".T"サフィックス付加
- **米国株**: 標準ティッカーシンボル使用
- **価格取得元**: Yahoo Finance 非公式API（`query1.finance.yahoo.com/v8/finance/chart`）を直接呼び出し。取得失敗時のみモックデータ（乱数）にフォールバック
- **価格更新**: ステータス追跡（SUCCESS/ERROR/PENDING）
- **市場セッション**: 前場・後場・時間外取引の識別

### データモデルと計算
- **ポートフォリオ集計**: 総投資額・損益・配当の自動計算
- **取引追跡**: 証券会社情報付きの完全な取引履歴
- **未実現損益**: 保有株ごとの自動計算
- **履歴分析**: 価格・配当・取引の時系列分析

### ユーザーインターフェース
- **ダッシュボード**: 総合サマリーとグラフ表示
- **株式管理**: 株式の追加・編集・削除
- **ポートフォリオ分析**: 構成比率とパフォーマンスの視覚化
- **取引記録**: 取引履歴の表示・追加
- **データインポート**: TSVファイルからの一括データ取り込み

## 開発・設計指針

### コーディング規約
- **TypeScript**: 厳密な型定義の使用
- **Zod**: APIリクエスト・レスポンスのバリデーション
- **Prisma**: データベースアクセスは必ずPrismaクライアント経由
- **SWR**: データフェッチングとキャッシュ管理
- **コンポーネント**: 機能ごとに分離された再利用可能なコンポーネント

### 株価取得システム
- **現在の実装**: Yahoo Finance 非公式API（v8 chart エンドポイント）から実際の株価を取得（`src/lib/stock-price.ts`）
- **フォールバック**: API呼び出しが失敗した場合のみ、乱数ベースのモック価格を返す（開発用）。この際 `priceSource` は `yahoo` のまま `SUCCESS` として保存されるため、実データと区別できない点に注意
- **更新対象**: 保有株数 > 0 の銘柄。銘柄ごとに直列処理（並列化なし）
- **将来の拡張**: Alpha Vantage、Polygon など正式API・複数ソース対応の余地あり
- **レート制限**: API呼び出し制限の考慮

### データベース設計
- **MySQL 8.0**: 本番環境対応
- **Prisma ORM**: スキーマファーストな設計
- **インデックス**: パフォーマンスを考慮したインデックス設計
- **リレーション**: 適切な外部キー制約とカスケード削除

### 認証・セキュリティ
- **NextAuth.js**: 設定済み（実装準備完了）
- **環境変数**: 機密情報の適切な管理
- **バリデーション**: フロントエンド・バックエンド両方での入力検証