'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Settings } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Broker {
  id: number
  name: string
}

export default function SettingsPage() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')

  const fetchBrokers = async () => {
    try {
      const response = await fetch('/api/brokers')
      const result = await response.json()
      setBrokers(result.data || [])
    } catch {
      setError('証券会社の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBrokers()
  }, [])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setError('')
    setAdding(true)
    try {
      const response = await fetch('/api/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || '追加に失敗しました')
      }
      setNewName('')
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setAdding(false)
    }
  }

  const handleUpdate = async (id: number) => {
    if (!editingName.trim()) return
    setError('')
    try {
      const response = await fetch(`/api/brokers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || '更新に失敗しました')
      }
      setEditingId(null)
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    setError('')
    try {
      const response = await fetch(`/api/brokers/${id}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        const result = await response.json()
        throw new Error(result.error?.message || '削除に失敗しました')
      }
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  const startEdit = (broker: Broker) => {
    setEditingId(broker.id)
    setEditingName(broker.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          設定
        </h1>
        <p className="text-muted-foreground mt-1">
          アプリケーションの設定を管理します
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>証券会社マスタ</CardTitle>
          <CardDescription>
            銘柄登録時に選択できる証券会社を管理します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 新規追加フォーム */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="flex-1 p-2 border rounded-md"
              placeholder="証券会社名を入力"
              disabled={adding}
            />
            <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-1">追加</span>
            </Button>
          </div>

          {/* 一覧 */}
          {loading ? (
            <p className="text-muted-foreground">読み込み中...</p>
          ) : brokers.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              証券会社が登録されていません
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {brokers.map((broker) => (
                <div
                  key={broker.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  {editingId === broker.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(broker.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        className="flex-1 p-1.5 border rounded-md text-sm"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdate(broker.id)}
                        disabled={!editingName.trim()}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        <X className="h-4 w-4 text-gray-500" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm">{broker.name}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(broker)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(broker.id, broker.name)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
