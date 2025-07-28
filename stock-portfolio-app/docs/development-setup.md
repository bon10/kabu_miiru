# 開発環境セットアップガイド

## 前提条件

以下のソフトウェアがインストールされている必要があります：

- **Node.js**: 20.x LTS以上
- **pnpm**: 9.x以上
- **Docker**: 最新版（データベース用）
- **Git**: 最新版

## セットアップ手順

### 1. プロジェクトのクローン

```bash
git clone <repository-url>
cd stock-portfolio-app
```

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成：

```bash
cp .env.example .env
```

`.env`ファイルを編集して必要な環境変数を設定：

```env
# データベース接続URL
DATABASE_URL="mysql://root:password@localhost:3306/stock_portfolio"

# Next.js設定
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# 外部API設定（将来使用）
YAHOO_FINANCE_API_KEY=""
```

### 4. データベースのセットアップ

#### Docker Composeを使用する場合

```bash
# データベースコンテナを起動
docker-compose up -d mysql

# データベーススキーマを適用
pnpm dlx prisma db push
```

#### ローカルMySQLを使用する場合

```bash
# MySQLサーバーが起動していることを確認
mysql -u root -p

# データベースを作成
CREATE DATABASE stock_portfolio;

# Prismaスキーマを適用
pnpm dlx prisma db push
```

### 5. 開発サーバーの起動

```bash
pnpm dev
```

アプリケーションは `http://localhost:3000` でアクセスできます。

## データベース管理

### Prisma Studio

データベースの内容を視覚的に確認・編集：

```bash
pnpm dlx prisma studio
```

### マイグレーション

スキーマ変更時：

```bash
# 開発環境での迅速な反映
pnpm dlx prisma db push

# 本番環境用のマイグレーションファイル生成
pnpm dlx prisma migrate dev --name "migration_name"
```

### データベースリセット

```bash
# データベースをリセット
pnpm dlx prisma migrate reset
```

## TSVデータのインポート

### サンプルデータの準備

`stock_template.tsv`ファイルがプロジェクトルートに配置されています。これは20列のTSVフォーマットの例です。

### インポート方法

1. **Web UI経由**:

   - `http://localhost:3000/import` にアクセス
   - TSVファイルをアップロード

2. **API経由**:
   ```bash
   curl -X POST http://localhost:3000/api/import/tsv \
     -F "file=@stock_template.tsv" \
     -F "options={\"replaceExisting\":false}"
   ```

## 開発用コマンド

### コード品質チェック

```bash
# ESLintでコード品質をチェック
pnpm lint

# Prettierでコードフォーマット
pnpm format

# 型チェック
pnpm type-check
```

### ビルド

```bash
# 本番用ビルド
pnpm build

# ビルド結果の確認
pnpm start
```

## トラブルシューティング

### よくある問題

#### 1. データベース接続エラー

```
Error: P1001: Can't reach database server
```

**解決方法**:

- MySQLサーバーが起動しているか確認
- `.env`ファイルの`DATABASE_URL`が正しいか確認
- ファイアウォール設定を確認

#### 2. ポート競合エラー

```
Error: listen EADDRINUSE: address already in use :::3000
```

**解決方法**:

```bash
# 使用中のプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>

# または別のポートを使用
pnpm dev -- -p 3001
```

#### 3. Prismaスキーマエラー

```
Error: Schema validation error
```

**解決方法**:

```bash
# Prismaクライアントを再生成
pnpm dlx prisma generate

# データベースをリセット
pnpm dlx prisma migrate reset
```

### ログの確認

開発中のログは以下の場所で確認できます：

- **アプリケーションログ**: コンソール出力
- **データベースログ**: Docker Composeの場合は `docker-compose logs mysql`
- **Next.jsログ**: `.next/` ディレクトリ

## 開発ワークフロー

### 1. 機能開発

```bash
# 新しいブランチを作成
git checkout -b feature/new-feature

# 開発作業
# ...

# コミット前のチェック
pnpm lint
pnpm type-check

# コミット
git add .
git commit -m "feat: add new feature"
```

### 2. データベーススキーマ変更

```bash
# schema.prismaを編集
# ...

# 変更を適用
pnpm dlx prisma db push

# 本番用マイグレーション生成
pnpm dlx prisma migrate dev --name "add_new_table"
```

### 3. API開発

1. `src/app/api/` にエンドポイントを作成
2. OpenAPI仕様書（`docs/6-api-spec/api-spec.yaml`）を更新
3. 型定義を更新
4. テストを作成（将来実装）

## 参考リンク

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [SWR Documentation](https://swr.vercel.app/)
- [Recharts Documentation](https://recharts.org/)
