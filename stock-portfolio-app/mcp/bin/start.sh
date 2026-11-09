#!/bin/sh
# MCP クライアントから起動するための入口。
# Claude Desktop はリポジトリの外のディレクトリから起動するため、まずこのスクリプトの
# 置き場所（mcp/）へ移る。tsx は今いるディレクトリの tsconfig.json で `@/` を解決する。
# node が PATH に無い環境（Claude Desktop など）では、クライアントの設定の env で
# PATH に node のディレクトリを渡す（mcp/README.md）。
cd "$(dirname "$0")/.." || exit 1
exec node_modules/.bin/tsx src/main.ts
