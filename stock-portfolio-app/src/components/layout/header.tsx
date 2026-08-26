'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Building2,
  History,
  Coins,
  Upload,
  RefreshCw,
  Settings,
  PieChart,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { requestPriceUpdate } from '@/lib/price-update'

// 価格更新の結果表示。成功のみ・一部失敗・全体失敗で色とメッセージを出し分ける。
type UpdateResult =
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

// 日常的に行き来する画面。ヘッダーに直接並べる。
const navigation = [
  { name: 'ダッシュボード', href: '/', icon: LayoutDashboard },
  { name: '保有一覧', href: '/holdings', icon: Building2 },
  { name: 'ポートフォリオ', href: '/portfolio', icon: PieChart },
  { name: '取引履歴', href: '/transactions', icon: History },
  { name: '配当（受取）', href: '/dividends', icon: Coins },
]

// たまにしか使わない画面。右端のメニューに畳んでヘッダーの幅を空ける。
const secondaryNavigation = [
  { name: 'インポート', href: '/import', icon: Upload },
  { name: '設定', href: '/settings', icon: Settings },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
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

  // ログイン画面ではナビゲーションも価格更新も操作できないため、ヘッダーごと出さない。
  if (pathname === '/login') {
    return null
  }

  const isCurrent = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href))

  const email = session?.user?.email

  return (
    <header className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 text-xl font-bold whitespace-nowrap text-primary"
          >
            株みーる
          </Link>

          {/* ラベルは狭い画面でアイコンだけに落とす。折り返させない（潰れて 2 行になるため） */}
          <nav className="flex min-w-0 items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  title={item.name}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isCurrent(item.href)
                      ? 'bg-accent text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {result && (
              <span
                className={cn(
                  'hidden text-sm whitespace-nowrap xl:inline',
                  result.type === 'success' && 'text-green-600',
                  result.type === 'warning' && 'text-yellow-600',
                  result.type === 'error' && 'text-red-600',
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
              title="価格更新"
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', isUpdating && 'animate-spin')} />
              <span className="hidden md:inline">
                {isUpdating ? '更新中...' : '価格更新'}
              </span>
            </Button>

            {email && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="アカウントメニュー"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {email.charAt(0).toUpperCase()}
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuLabel className="text-muted-foreground font-normal">
                    {email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {secondaryNavigation.map((item) => {
                    const Icon = item.icon
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link
                          href={item.href}
                          className={cn(isCurrent(item.href) && 'text-primary')}
                        >
                          <Icon className="h-4 w-4" />
                          {item.name}
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => signOut({ callbackUrl: '/login' })}
                  >
                    <LogOut className="h-4 w-4" />
                    ログアウト
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
