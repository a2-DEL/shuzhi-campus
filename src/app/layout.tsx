import type { Metadata } from 'next'
import { Inspector } from 'react-dev-inspector'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '数智星图校园服务平台',
    template: '%s | 数智星图',
  },
  description: '数智星图校园服务平台 - 校园智慧管理一站式解决方案',
  keywords: ['校园服务', '智慧校园', '数智星图', '校园管理'],
  authors: [{ name: '数智星图团队' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Inspector />
        {children}
      </body>
    </html>
  )
}
