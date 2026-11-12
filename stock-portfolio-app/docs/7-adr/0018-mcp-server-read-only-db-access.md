# ADR 0018: MCP サーバーは読み取り専用の DB ユーザーで本番 DB を直接読む

## Status

Accepted (2026-11-09)

## Context

保有を分野別に見て、未投資の分野を探したり売買を検討したりするのを、Claude との会話で進めたい。そのために、Claude Code と Claude Desktop から保有データを読める MCP サーバー（`mcp/`）を作る。

MCP サーバーがデータを得る経路は 2 つ考えられる。アプリの API を呼ぶか、DB に直接つなぐか。アプリの API は middleware がログイン済みかを判定しており（ADR 0011・0014）、ログインは Google OAuth しか無い。MCP サーバーが Google にログインする手段は無い。

扱うのは所有者の資産情報で、読むだけでも漏れてはならない。

## 検討した代替案

- **案A（採用）：MCP サーバーを所有者の PC で動かし、読み取り専用の DB ユーザーで本番 DB を直接読む。** 外から MCP につなぐ入口を作らない。読める範囲は DB の権限で絞る。
- **案B：アプリの `DATABASE_URL`（読み書きできるユーザー）で直接読む。** 設定が最も少ない。/ 不採用：「読むだけ」がコードの約束でしかなく、取引履歴など不要なテーブルも読めてしまう。
- **案C：アプリに MCP 用の API キー認証を足し、MCP サーバーはアプリの API を呼ぶ。** アプリのバッチと同じく `X-API-Key` で認証する。/ 不採用：インターネットから資産情報を読める入口が 1 つ増える。キーが漏れると、どこからでも読める。
- **案D：MCP サーバーを Vercel に置き、リモート MCP として公開する。** / 不採用：案C と同じく公開の入口が増え、OAuth の実装も要る。所有者 1 人が手元で使う用途に見合わない。

## Decision

**MCP サーバーは所有者の PC で stdio で動かし、銘柄・配当・為替レートの 3 テーブルに SELECT 権限だけを持つ DB ユーザーで、本番 DB を直接読む。**

> 追記（2026-11-12）：基準チェック（ADR 0021）のため、財務の最新値（`StockFundamental`）・購入時の指標（`FundamentalSnapshot`）・日次終値（`DailyPrice`）の 3 テーブルにも SELECT 権限を足した。読むのは保有銘柄の財務の値と終値で、取引履歴は引き続き読まない。

- 接続文字列は `stock-portfolio-app/.env` の `MCP_DATABASE_URL` に置く。起動口（`mcp/src/main.ts`）がこれを `DATABASE_URL` に入れてから Prisma を読み込む
- `MCP_DATABASE_URL` が無いときは起動しない。`DATABASE_URL` に黙って戻ると、読み書きできるユーザーで動いてしまうため
- USD/JPY レートは Yahoo から取り直さず、保存済みの最新値を使う（`getLatestStoredUsdJpyRate`）。アプリの `getCurrentUsdJpyRate` は当日分が無いと DB に保存しようとするが、読み取り専用ユーザーでは保存できないため
- ツールは呼ぶたびに所有者が承認する。Claude Code の `permissions.allow` に入れず、Claude Desktop でも常に許可しない
- 登録先は Claude Code（このリポジトリの `.mcp.json`）と Claude Desktop の 2 つ

## 決定していないこと

- **書き込みのツール（取引の登録など）。** 置いていない。必要になったら、書き込み用のユーザーを分けるか、アプリの API を通すかから決め直す。
- **読み取り専用ユーザーのパスワードの置き場所。** `.env` に平文で置いている。アプリの `DATABASE_URL` と同じ扱いで、OS のキーチェーンなどには移していない。
- **Claude Desktop で、ウェブを読むツールと同じ会話で使うことの制限。** 毎回の承認に任せている。

## Consequences

- 所有者が TiDB で読み取り専用ユーザーを作り、`.env` に `MCP_DATABASE_URL` を足す必要がある（手順は `mcp/README.md`）
- MCP が読むテーブルを増やすときは、そのテーブルにも SELECT 権限を足す必要がある。足し忘れると、ツールが権限エラーを返す
- 保有データが Claude との会話に載る。ツールを承認した会話の範囲に限られる
- 保有一覧の計算を `loadHoldingRows`（`src/lib/holdings.ts`）に切り出し、アプリの API と MCP が共用する

### プレモーテム（この決定が誤っていた場合）

- `.env` には読み書きできる `DATABASE_URL` も並んでいる。PC が乗っ取られれば、MCP の権限を絞っていても DB 全体が読み書きされる。MCP の権限を絞って防げるのは、MCP 経由の誤操作と、MCP 経由で読める範囲の広がりまで
- 承認が面倒になり、Claude Desktop で常に許可してしまうと、ウェブページに埋め込まれた指示で保有データを読まれ、会話の中で外に出される余地が生まれる
- アプリのスキーマ変更でテーブル名が変わると、権限が外れて MCP が動かなくなる。気づくのは次に MCP を使ったとき

## 見直しトリガー

- **書き込みのツールが欲しくなったとき** → 書き込み用のユーザーを分けるか、アプリの API を通すかを決め直す
- **所有者以外が MCP を使いたくなったとき** → PC ごとに読み取り専用ユーザーを配る形が成り立たない。案D（認証つきのリモート MCP）を検討する
- **MCP が読むテーブルを増やすとき** → 権限の追加と、その情報を会話に載せてよいかを確認する
- **常に許可にしたくなったとき** → 毎回の承認に代わる守り方（ツールを使う会話を分けるなど）を決める

## 関連

- [ADR 0011 ログインは Google のみ・許可メールアドレス 1 件](0011-single-user-google-login.md)（アプリの API の認証。MCP はこの経路を通らない）
- [ADR 0014 セッション判定は middleware だけ](0014-session-check-in-middleware-only.md)
- [ADR 0013 Vercel + TiDB へのデプロイ構成](0013-deploy-vercel-tidb.md)（本番 DB）
- [ADR 0017 セクターは Yahoo Finance の分類](0017-sector-from-yahoo-classification.md)（MCP が分野別にまとめるときの分類）
- [ADR 0020 銘柄の財務指標は Yahoo の通期決算から計算する](0020-fundamentals-from-yahoo-timeseries.md)（MCP が DB 以外に Yahoo を読むツール。DB の権限は本 ADR のまま）
- [ADR 0021 保有銘柄の基準チェック](0021-fundamental-check-for-holdings.md)（MCP が読むテーブルを 3 つ足した）
