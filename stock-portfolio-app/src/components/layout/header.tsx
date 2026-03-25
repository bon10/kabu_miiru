'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TrendingUp, BarChart3, History, Upload, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  {
    name: 'ダッシュボード',
    href: '/',
    icon: BarChart3
  },
  {
    name: '銘柄一覧',
    href: '/stocks',
    icon: TrendingUp
  },
  {
    name: 'ポートフォリオ',
    href: '/portfolio',
    icon: BarChart3
  },
  {
    name: '取引履歴',
    href: '/transactions',
    icon: History
  },
  {
    name: 'インポート',
    href: '/import',
    icon: Upload
  },
  {
    name: '設定',
    href: '/settings',
    icon: Settings
  }
]

export default function Header() {
  const pathname = usePathname()

  const handlePriceUpdate = async () => {
    try {
      const response = await fetch('/api/prices/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        // 成功時の処理（toastやリロード等）
        window.location.reload()
      }
    } catch (error) {
      console.error('価格更新エラー:', error)
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
                const isActive = pathname === item.href || 
                  (item.href !== '/' && pathname.startsWith(item.href))
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-2 text-sm font-medium transition-colors hover:text-primary',
                      isActive 
                        ? 'text-primary' 
                        : 'text-muted-foreground'
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
            <Button
              variant="outline"
              size="sm"
              onClick={handlePriceUpdate}
              className="flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>価格更新</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}