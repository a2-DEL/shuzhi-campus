'use client'

import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, ArrowLeft } from 'lucide-react'
import Link from 'next/link'


export default function PrivacyPolicyPage() {
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/student/profile">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回个人中心
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              隐私政策
            </CardTitle>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">1. 信息收集</h3>
                <p className="text-muted-foreground leading-relaxed">
                  我们收集您主动提供的信息，包括但不限于：个人基本信息（姓名、学号/工号、联系方式）、班级/部门信息、报修记录、教室预约记录、失物招领信息等。这些信息将用于提供校园服务平台的相关服务。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">2. 信息使用</h3>
                <p className="text-muted-foreground leading-relaxed">
                  您的信息将用于：
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li>提供报修、教室预约等校园服务</li>
                  <li>发送服务通知和消息提醒</li>
                  <li>统计和分析服务使用情况</li>
                  <li>改进平台功能和服务质量</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">3. 信息保护</h3>
                <p className="text-muted-foreground leading-relaxed">
                  我们采用行业标准的安全措施保护您的个人信息，防止数据遭到未经授权的访问、修改、披露或销毁。您的敏感信息（如密码）已进行加密处理。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">4. 信息共享</h3>
                <p className="text-muted-foreground leading-relaxed">
                  未经您的同意，我们不会与任何第三方共享您的个人信息，除非：
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li>法律法规要求</li>
                  <li>保护平台和用户的合法权益</li>
                  <li>服务提供所必需的第三方（如维修人员）</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">5. 您的权利</h3>
                <p className="text-muted-foreground leading-relaxed">
                  您有权：
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li>访问和查看您的个人信息</li>
                  <li>更正不准确的信息</li>
                  <li>删除您的账户和个人信息</li>
                  <li>联系我们获取更多信息</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">6. 联系我们</h3>
                <p className="text-muted-foreground leading-relaxed">
                  如您对本隐私政策有任何疑问，请联系现教中心管理员。
                </p>
              </section>

              <section className="text-sm text-muted-foreground">
                <p>最后更新日期：2024年1月</p>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
