# 株式ポートフォリオ管理システム

2つの株式ポートフォリオ管理アプリケーションを含む完全なソリューション：

1. **Python株価取得ツール**（ルートディレクトリ）- yfinanceを使用してリアルタイム株価を取得し、CSVに保存するシンプルなコマンドラインツール
2. **Next.jsポートフォリオ管理アプリ**（`stock-portfolio-app/`）- 複数の証券会社のポートフォリオ管理をサポートする本格的なWebアプリケーション

## 🚀 クイックスタート

### Python株価取得ツール

```bash
# 依存関係のインストール
pip install -r requirements.txt

# 株価取得の実行
python main.py
```

### Next.jsポートフォリオアプリケーション

```bash
# アプリケーションディレクトリに移動
cd stock-portfolio-app

# 依存関係のインストール
pnpm install

# Prismaクライアントの生成
pnpm dlx prisma generate

# データベーススキーマの反映
pnpm dlx prisma db push

# 開発サーバーの起動
pnpm dev
```

## 📋 主な機能

### Next.jsアプリケーションの主要機能

- **📊 ポートフォリオ分析**
  - 株式/証券会社/市場別の構成比率分析
  - 円グラフと棒グラフによる視覚化
  - 利益パフォーマンス分析と比較

- **📈 株式管理**
  - 日本株（数字コード + .T）と米国株の両方をサポート
  - リアルタイム株価更新と価格履歴の追跡
  - 株式詳細情報の編集と管理

- **💰 取引記録**
  - 売買取引履歴の完全な追跡
  - 配当記録の管理
  - 取引統計とフィルタリング機能

- **📄 データインポート**
  - TSVファイルの一括インポート機能
  - データのプレビューと検証
  - エラー処理と修正

- **🎯 リアルタイム価格システム**
  - 自動株価更新メカニズム
  - 複数データソースのサポート
  - 価格履歴の追跡

## 🏗️ 技術アーキテクチャ

### Next.jsアプリケーション

- **Frontend**: Next.js 15 (App Router) + TypeScript + React 19
- **Backend**: Next.js API Routes
- **データベース**: SQLite + Prisma ORM
- **UI**: Tailwind CSS + Radix UI + Lucide React
- **チャート**: Recharts
- **フォーム**: React Hook Form + Zod
- **パッケージマネージャー**: pnpm

### データベース構成

```sql
-- 主要テーブル
User              -- ユーザーアカウント
Portfolio         -- ポートフォリオ情報
Stock             -- 株式マスターデータ
PortfolioStock    -- ポートフォリオ内の保有株
Transaction       -- 取引履歴
```

## 🔧 開発コマンド

### データベース操作

```bash
cd stock-portfolio-app

# Prismaクライアントの生成
pnpm dlx prisma generate

# スキーマ変更の反映
pnpm dlx prisma db push

# データベースGUIの起動
pnpm dlx prisma studio

# データベースのリセット
pnpm db:reset
```

### 開発とビルド

```bash
cd stock-portfolio-app

# 開発モード（Turbopack使用）
pnpm dev

# アプリケーションのビルド
pnpm build

# 本番版の起動
pnpm start

# コードの検査
pnpm lint
```

### Dockerデプロイメント

```bash
cd stock-portfolio-app

# 全サービスの起動（バックグラウンド実行）
docker-compose up -d

# 全サービスの停止
docker-compose down

# アプリケーションログの確認
docker-compose logs -f app
```

## 📁 プロジェクト構造

```
stock-portfolio-app/
├── src/
│   ├── app/                 # Next.js App Routerページ
│   │   ├── api/            # APIルート
│   │   ├── dashboard/      # ダッシュボードページ
│   │   ├── stocks/         # 株式管理ページ
│   │   ├── portfolio/      # ポートフォリオ分析ページ
│   │   ├── transactions/   # 取引記録ページ
│   │   └── import/         # データインポートページ
│   ├── components/         # Reactコンポーネント
│   │   ├── ui/            # 基本UIコンポーネント
│   │   ├── layout/        # レイアウトコンポーネント
│   │   └── portfolio/     # ポートフォリオ専用コンポーネント
│   ├── lib/               # ユーティリティ関数と共通ロジック
│   └── types/             # TypeScript型定義
├── prisma/                # データベーススキーマとマイグレーション
├── docker/                # Docker関連ファイル
└── docs/                  # プロジェクトドキュメント
```

## 🌐 APIエンドポイント

### 株式関連
- `GET /api/stocks` - 全株式の取得
- `GET /api/stocks/[id]` - 特定株式の詳細取得
- `PUT /api/stocks/[id]` - 株式情報の更新

### ポートフォリオ分析
- `GET /api/portfolio/composition` - ポートフォリオ構成分析
- `GET /api/portfolio/performance` - ポートフォリオパフォーマンス分析

### 取引記録
- `GET /api/transactions` - 取引記録の取得（フィルタとページングをサポート）
- `POST /api/transactions` - 取引記録の追加
- `GET /api/transactions/summary` - 取引統計サマリー

### 価格更新
- `POST /api/prices/update` - 株価の更新
- `GET /api/prices/history/[stockId]` - 株価履歴

### データインポート
- `POST /api/import/tsv` - TSVファイルインポート

### サマリー
- `GET /api/summary` - 全体サマリー
- `GET /api/summary/by-company` - 企業別サマリー

## 💾 データ処理

### 株式コード形式
- **日本株**: 数字コード（例："7203"）は自動的に".T"サフィックスを付加してAPI呼び出し
- **米国株**: 標準株式コード（例："AAPL", "TSLA"）

### TSVインポート形式
完全な20フィールドTSVファイルインポートをサポート：
- 基本情報：株式名、コード、証券会社、市場
- 保有情報：保有数量、平均コスト、投資金額
- 損益情報：現在価格、損益、損益率
- 配当情報：1株当たり配当、配当率、配当金額
- その他：購入日、目標価格など

## 🔍 開発上の注意事項

1. **株価データソース**: 独自のYahoo Finance API統合を使用
2. **データベース**: SQLiteをデフォルト使用、Docker Composeで迅速なデプロイメント可能
3. **型安全性**: TypeScriptとZodを全面的に使用した型チェック
4. **スタイルシステム**: Tailwind CSS + CSS Variables でテーマ切り替えをサポート
5. **パフォーマンス最適化**: SWRを使用したデータキャッシュと同期

## 📈 今後の予定

- [ ] ユーザー認証システム (NextAuth.js)
- [ ] 多通貨サポート
- [ ] 株価アラート機能
- [ ] より多くのチャート分析機能
- [ ] モバイルデバイス最適化
- [ ] API Rate Limiting
- [ ] 株式ニュース統合

## 🤝 貢献ガイド

1. プロジェクトをFork
2. 機能ブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. Pull Requestを開く

## 📄 ライセンス

このプロジェクトはMITライセンスの下で提供されます - 詳細は[LICENSE](LICENSE)ファイルを参照

## 🔧 トラブルシューティング

### よくある質問

**Q: 株価が更新されない**
A: ネットワーク接続とYahoo Finance APIの可用性を確認してください

**Q: データベース接続エラー**
A: `.env`ファイルの`DATABASE_URL`設定が正しいことを確認してください

**Q: Dockerコンテナの起動に失敗する**  
A: Dockerが正常に動作していることを確認し、`docker-compose.yml`の設定を確認してください

**Q: TSVインポートが失敗する**
A: ファイル形式とフィールドマッピングを確認し、データ形式が正しいことを確認してください