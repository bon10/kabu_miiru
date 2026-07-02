'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  History,
  Coins,
  Upload,
  RefreshCw,
  Settings,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { requestPriceUpdate } from '@/lib/price-update'

// 価格更新の結果表示。成功のみ・一部失敗・全体失敗で色とメッセージを出し分ける。
type UpdateResult =
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

const navigation = [
  {
    name: 'ダッシュボード',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    name: '保有一覧',
    href: '/holdings',
    icon: Building2,
  },
  {
    name: 'ポートフォリオ',
    href: '/portfolio',
    icon: PieChart,
  },
  {
    name: '取引履歴',
    href: '/transactions',
    icon: History,
  },
  {
    name: '配当（受取）',
    href: '/dividends',
    icon: Coins,
  },
  {
    name: 'インポート',
    href: '/import',
    icon: Upload,
  },
  {
    name: '設定',
    href: '/settings',
    icon: Settings,
  },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [isUpdating, setIsUpdating] = useState(false)
  const [result, setResult] = useState<UpdateResult | null>(null)

  const handlePriceUpdate = async () => {
    setIsUpdating(true)
    setResult(null)
    try {
      const { updatedCount, failedCount } = await requestPriceUpdate()

      if (failedCount === 0) {
        setResult({ type: 'success', message: `${updatedCount}件を更新しました` })
      } else if (updatedCount === 0) {
        setResult({
          type: 'error',
          message: `${failedCount}件すべて更新できませんでした`,
        })
      } else {
        setResult({
          type: 'warning',
          message: `${updatedCount}件更新・${failedCount}件失敗`,
        })
      }

      // サーバーコンポーネント（各画面のDB表示）だけ再取得する。
      // 全画面リロードだと結果メッセージが消えるため router.refresh を使う。
      router.refresh()
    } catch (error) {
      console.error('価格更新エラー:', error)
      setResult({ type: 'error', message: '価格更新に失敗しました' })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <header className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-primary">
              株みーる
            </Link>

            <nav className="flex items-center space-x-6">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-2 text-sm font-medium transition-colors hover:text-primary',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {result && (
              <span
                className={cn(
                  'text-sm',
                  result.type === 'success' && 'text-green-600',
                  result.type === 'warning' && 'text-yellow-600',
                  result.type === 'error' && 'text-red-600'
                )}
              >
                {result.message}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePriceUpdate}
              disabled={isUpdating}
              className="flex items-center space-x-2"
            >
              <RefreshCw
                className={cn('h-4 w-4', isUpdating && 'animate-spin')}
              />
              <span>{isUpdating ? '更新中...' : '価格更新'}</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
