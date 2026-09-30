'use client'

import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function UserAgreementPage() {
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
              <FileText className="h-5 w-5 text-blue-600" />
              用户协议
            </CardTitle>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">1. 服务说明</h3>
                <p className="text-muted-foreground leading-relaxed">
                  数智星图校园服务平台（以下简称&ldquo;平台&rdquo;）是由现教中心开发和维护的综合性校园管理服务平台。平台提供报修管理、教室预约、失物招领、值日安排、宿舍管理、通知发布等功能服务。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">2. 账户注册</h3>
                <p className="text-muted-foreground leading-relaxed">
                  用户在使用平台服务前需要注册账户。账户信息由现教中心统一分配和管理，用户有责任妥善保管账户信息，并对账户下发生的所有活动负责。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">3. 服务使用规范</h3>
                <p className="text-muted-foreground leading-relaxed">
                  用户在使用平台服务时应遵守以下规范：
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li>提交真实、准确的报修信息</li>
                  <li>按规定使用教室预约服务</li>
                  <li>遵守失物招领的诚信原则</li>
                  <li>按时完成值日任务</li>
                  <li>不得利用平台从事违法活动</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">4. 知识产权</h3>
                <p className="text-muted-foreground leading-relaxed">
                  平台上的所有内容，包括但不限于文字、图片、图标、界面设计等，均受知识产权法律保护。未经授权，用户不得复制、修改、传播或用于其他商业目的。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">5. 免责声明</h3>
                <p className="text-muted-foreground leading-relaxed">
                  平台会尽力确保服务的稳定性和可靠性，但不对以下情况承担责任：
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li>因不可抗力导致的服务中断</li>
                  <li>因用户操作失误导致的数据丢失</li>
                  <li>第三方服务提供商的原因</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">6. 服务变更</h3>
                <p className="text-muted-foreground leading-relaxed">
                  平台保留随时修改或中断服务而不另行通知的权利。平台也可能根据实际情况新增或调整功能，用户应关注平台公告。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">7. 争议解决</h3>
                <p className="text-muted-foreground leading-relaxed">
                  本协议的解释和执行均适用中华人民共和国法律。如发生争议，双方应友好协商解决；协商不成的，可向有管辖权的人民法院提起诉讼。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">8. 其他</h3>
                <p className="text-muted-foreground leading-relaxed">
                  本协议自用户注册账户之日起生效。平台有权根据实际情况修改本协议，修改后的协议将公布在平台上，如用户继续使用服务，视为接受修改后的协议。
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
