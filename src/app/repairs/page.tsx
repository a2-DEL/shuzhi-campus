import { BusinessModulePage } from '@/components/business/business-module-page'

export default function RepairsPage() {
  return <BusinessModulePage
    domainKey="repair"
    title="报修与 SLA 作战中心"
    subtitle="从受理、优先级识别、负载派单到现场完成与 SLA 回读，工单责任和每次 Agent 动作均可追踪。"
    endpoint="/api/ai/business-records?domain=repair"
    skillId="repair_dispatch"
    agentTitle="报修智能派单"
    agentDescription="墨龟读取真实待派工单与维修人员负载，形成派单预览；人工裁决后写入责任人与 SLA，并回读验证。"
    agentParams={{ count: 1, reason: '从报修作战中心发起的受控派单' }}
    recordLabel="工单"
    columns={[
      { key: 'title', label: '工单事项' }, { key: 'location', label: '服务位置' },
      { key: 'priority', label: '优先级', kind: 'status' }, { key: 'status', label: '处置状态', kind: 'status' },
      { key: 'assignee_name', label: '责任工程师', kind: 'person' }, { key: 'sla_due_at', label: 'SLA 时限', kind: 'date' },
      { key: 'created_at', label: '受理时间', kind: 'date' },
    ]}
  />
}
