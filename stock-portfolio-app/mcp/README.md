# kabu-miiru-mcp-server

株みーるの保有データを、Claude Code や Claude Desktop から**読むだけ**の MCP サーバー（stdio）。分野ごとの偏りや未投資の分野を、チャットで相談しながら確認するために使う。

## ツール

| ツール | 返すもの |
| --- | --- |
| `portfolio_get_breakdown` | セクター・市場・証券会社のどれかでまとめた評価額・比率・投資額・評価損益・損益率。セクターでまとめたときは、Yahoo の 11 分類のうち 1 銘柄も持っていないセクターも返す |
| `portfolio_list_holdings` | 保有銘柄を 1 銘柄 1 行で。市場・セクターで絞り込み、評価額・損益・損益率で並べ替えられる |

どちらも `response_format` に `markdown`（既定）か `json` を指定できる。

## 資産情報の守り方（ADR 0018）

MCP はアプリのログインを通らず、本番 DB（TiDB）に直接つなぐ。外から MCP につなぐ入口は無く、MCP を起動した PC の中だけで動く。そのうえで、資産情報を読める範囲を次の 3 つで絞る。

1. **DB は読み取り専用ユーザーで読む。** 銘柄・配当・為替レートの 3 テーブルに SELECT 権限だけを持つユーザーを使う。書き込みと、取引履歴など他のテーブルの読み取りは DB 側で拒否される。アプリの `DATABASE_URL`（読み書きできるユーザー）では起動しない
2. **ツールは呼ぶたびに承認する。** Claude Code では `.claude/settings*.json` の `permissions.allow` に `mcp__kabu-miiru__*` を入れない。Claude Desktop では、承認を求められたときに常に許可する方を選ばない。関係ない会話で資産情報が読まれそうになったときに断れるようにするため
3. **為替レートも保存しない。** 保存済みの最新レートを使う。当日分は毎朝の日次終値バッチか、アプリの画面を開いたときに保存される

## 前提

- 現在価格・評価損益・評価損益率は最後に価格更新した時点の保存値。古ければアプリのヘッダーの「価格更新」を押す（[価格更新をしないと変わらない数値](../docs/1-requirements/price-update.md#価格更新をしないと変わらない数値)）。計算はアプリの保有一覧と同じ `loadHoldingRows`（`src/lib/holdings.ts`）を使う
- セクターは Yahoo Finance の分類（GICS ではない。ADR 0017）

## セットアップ

### 1. 読み取り専用ユーザーを作る

TiDB Cloud のコンソールの SQL エディタで実行する。TiDB Cloud Starter ではユーザー名にクラスタごとの接頭辞が必要で、接頭辞は接続文字列のユーザー名（`xxxxx.root` の `xxxxx`）と同じ（[TiDB Cloud のドキュメント](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)）。DB 名は接続文字列の末尾の値に合わせる。

```sql
CREATE USER 'xxxxx.kabu_mcp' IDENTIFIED BY 'パスワード';
GRANT SELECT ON stock_portfolio.Stock TO 'xxxxx.kabu_mcp';
GRANT SELECT ON stock_portfolio.DividendHistory TO 'xxxxx.kabu_mcp';
GRANT SELECT ON stock_portfolio.ExchangeRate TO 'xxxxx.kabu_mcp';
```

パスワードは `openssl rand -hex 24` などで作る（接続文字列に入れるので、`+` `/` `=` を含まない 16 進数が扱いやすい）。

### 2. 接続文字列を .env に入れる

`stock-portfolio-app/.env` に `MCP_DATABASE_URL` を足す。書式は `.env.example` を参照。

### 3. 依存を入れて動作確認する

```bash
cd stock-portfolio-app/mcp
pnpm install
pnpm smoke   # サーバーを起動して各ツールを呼ぶ
```

アプリとは別のパッケージにしている。MCP の TypeScript SDK（v2）が zod 4 を必要とする一方、アプリは zod 3 を使っているため。アプリのコード（`../src/lib`）は `@/` のエイリアスで読み込み、ビルドせず `tsx` で直接動かす。

## 登録

起動口は `bin/start.sh`。どこから起動されても `mcp/` に移ってからサーバーを動かす。登録後はクライアントの再起動が要る。

### Claude Code（このリポジトリだけ）

プロジェクトルート（リポジトリ直下、`stock-portfolio-app/` の 1 つ上）の `.mcp.json`（git の管理外。見本は `.mcp.json.example`）の `mcpServers` に足す。このリポジトリで Claude Code を起動したときだけ読まれる。

```json
"kabu-miiru": {
  "command": "stock-portfolio-app/mcp/bin/start.sh"
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` の `mcpServers` に足す。パスはすべて絶対パスにする。Claude Desktop は node の場所を知らないので、`PATH` に node のディレクトリを渡す（`asdf which node` などで調べる）。

```json
"kabu-miiru": {
  "command": "/絶対パス/stock-portfolio-app/mcp/bin/start.sh",
  "env": {
    "PATH": "/node のあるディレクトリ:/usr/bin:/bin"
  }
}
```

asdf などで Node のバージョンを切り替えると、node のディレクトリが変わり、Claude Desktop から起動できなくなる。そのときは `PATH` を書き換える。

起動に失敗したときのログは `~/Library/Logs/Claude/mcp-server-kabu-miiru.log`。

## 開発

```bash
pnpm typecheck   # アプリ側の読み込むコードも含めて型チェック
pnpm smoke
```

アプリの `tsconfig.json` は `mcp/` を対象から外している。Vercel のビルドには `mcp/` の依存が入らず、含めると型チェックで落ちるため。
