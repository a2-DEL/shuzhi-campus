import { BusinessModulePage } from '@/components/business/business-module-page'

export default function NotificationsPage() {
  return <BusinessModulePage
    domainKey="notification"
    title="消息触达与回执中心"
    subtitle="通知不止于发布：受众由服务端解析，投递、阅读、确认和失败重试均形成正式业务证据。"
    endpoint="/api/ai/business-records?domain=notification"
    skillId="notification_publish"
    agentTitle="企业消息触达"
    agentDescription="灵鹊解析真实受众，人工裁决后创建通知与投递任务，并持续回读阅读、确认和失败重试结果。"
    recordLabel="通知"
    columns={[
      { key: 'title', label: '通知主题' }, { key: 'type', label: '业务类型', kind: 'status' },
      { key: 'status', label: '发布状态', kind: 'status' }, { key: 'audience_count', label: '目标人数', kind: 'number' },
      { key: 'delivered_count', label: '已送达', kind: 'number' }, { key: 'acknowledged_count', label: '已确认', kind: 'number' },
      { key: 'failed_count', label: '失败重试', kind: 'number' }, { key: 'publish_at', label: '发布时间', kind: 'date' },
    ]}
  />
}
