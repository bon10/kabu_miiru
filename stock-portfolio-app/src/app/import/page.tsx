'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react'

interface ImportResult {
  success: boolean
  message: string
  imported?: number
  updated?: number
  errors?: string[]
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [preview, setPreview] = useState<string[][]>([])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile && selectedFile.type === 'text/tab-separated-values' || selectedFile.name.endsWith('.tsv')) {
      setFile(selectedFile)
      setResult(null)
      
      // ファイルプレビュー
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const rows = text.split('\n').slice(0, 6) // 最初の6行のみプレビュー
        const parsedRows = rows.map(row => row.split('\t'))
        setPreview(parsedRows)
      }
      reader.readAsText(selectedFile)
    } else {
      alert('TSVファイルを選択してください')
    }
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/import/tsv', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()
      setResult(result)
    } catch (error) {
      setResult({
        success: false,
        message: 'インポート中にエラーが発生しました'
      })
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = [
      'No', '銘柄名', '保有会社', '市場', 'コード', '保有株数', '平均取得単価',
      '投資額', '現在価格', '損益', '損益率', '1株配当金', '配当利回り', '配当金額',
      '購入日', '売却日', '実現損益', '目標価格', '市場・セクター', '目的'
    ]
    
    const csvContent = headers.join('\t') + '\n' + 
      '1\tサンプル銘柄\tSBI証券\t国内\t1234\t100\t1000\t100000\t1100\t10000\t0.1\t50\t0.045\t5000\t2023-01-01\t\t\t1200\tテクノロジー\t成長投資'
    
    const blob = new Blob([csvContent], { type: 'text/tab-separated-values' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'stock_template.tsv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">TSVインポート</h1>
        <p className="text-muted-foreground">
          指定フォーマットのTSVファイルから銘柄データを一括インポートします
        </p>
      </div>

      {/* テンプレートダウンロード */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>テンプレートファイル</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            まずはテンプレートファイルをダウンロードして、正しいフォーマットを確認してください。
          </p>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            テンプレートをダウンロード
          </Button>
        </CardContent>
      </Card>

      {/* ファイル選択 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>ファイル選択</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium mb-2">TSVファイルを選択</p>
              <p className="text-sm text-muted-foreground mb-4">
                クリックしてファイルを選択するか、ここにドラッグ&ドロップしてください
              </p>
              <input
                type="file"
                accept=".tsv,text/tab-separated-values"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input">
                <Button variant="outline" className="cursor-pointer">
                  ファイルを選択
                </Button>
              </label>
            </div>

            {file && (
              <div className="flex items-center space-x-2 text-sm">
                <FileText className="h-4 w-4" />
                <span>選択されたファイル: {file.name}</span>
                <span className="text-muted-foreground">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* プレビュー */}
      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>プレビュー</CardTitle>
            <p className="text-sm text-muted-foreground">
              ファイルの最初の数行を表示しています
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={index} className={index === 0 ? 'font-medium bg-gray-50' : ''}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border p-2 truncate max-w-32">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* インポート実行 */}
      {file && (
        <Card>
          <CardHeader>
            <CardTitle>インポート実行</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">注意事項</p>
                    <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                      <li>• 既存の銘柄データは更新されます</li>
                      <li>• 必須項目（銘柄名、保有会社、市場、コード）が不足している行はスキップされます</li>
                      <li>• インポート前にデータのバックアップを推奨します</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleImport} 
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    インポート中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    インポート実行
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 結果表示 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span>インポート結果</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-4 rounded-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.message}
              </p>
              
              {result.success && (
                <div className="mt-3 space-y-1 text-sm text-green-700">
                  {result.imported && (
                    <p>• 新規追加: {result.imported}件</p>
                  )}
                  {result.updated && (
                    <p>• 更新: {result.updated}件</p>
                  )}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-800">エラー詳細:</p>
                  <ul className="text-sm text-red-700 mt-1 space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* フォーマット説明 */}
      <Card>
        <CardHeader>
          <CardTitle>TSVフォーマット仕様</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-2">必須列:</p>
              <div className="grid grid-cols-2 gap-2">
                <span>• No</span>
                <span>• 銘柄名</span>
                <span>• 保有会社</span>
                <span>• 市場</span>
                <span>• コード</span>
                <span>• 保有株数</span>
                <span>• 平均取得単価</span>
                <span>• 投資額</span>
              </div>
            </div>
            
            <div>
              <p className="font-medium mb-2">オプション列:</p>
              <div className="grid grid-cols-2 gap-2">
                <span>• 現在価格</span>
                <span>• 損益</span>
                <span>• 損益率</span>
                <span>• 1株配当金</span>
                <span>• 配当利回り</span>
                <span>• 配当金額</span>
                <span>• 購入日</span>
                <span>• 売却日</span>
                <span>• 実現損益</span>
                <span>• 目標価格</span>
                <span>• 市場・セクター</span>
                <span>• 目的</span>
              </div>
            </div>

            <div className="bg-gray-50 border rounded-lg p-3">
              <p className="font-medium mb-2">注意:</p>
              <ul className="space-y-1">
                <li>• ファイル形式はTSV（タブ区切り）である必要があります</li>
                <li>• 1行目はヘッダー行として扱われます</li>
                <li>• 日付は YYYY-MM-DD 形式で入力してください</li>
                <li>• 数値に カンマ(,) は含めないでください</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}