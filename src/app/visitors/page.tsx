import { BusinessModulePage } from '@/components/business/business-module-page'

export default function VisitorsPage() {
  return <BusinessModulePage
    domainKey="visitor"
    title="访客准入与合规治理"
    subtitle="人工核验身份、被访关系和来访事由；审批通过后仅签发与申请绑定的一次性短效凭证。"
    endpoint="/api/ai/business-records?domain=visitor"
    skillId="visitor_approve"
    agentTitle="访客准入裁决"
    agentDescription="獬豸检查业务边界并生成准入预览，最终决定始终由有权人员作出，凭证短效且可审计。"
    agentParamMap={{ visitorApplicationId: 'id' }}
    recordLabel="访客申请"
    columns={[
      { key: 'visitor_name', label: '访客姓名' }, { key: 'visitor_phone', label: '联系电话', kind: 'phone' },
      { key: 'dormitory_name', label: '被访楼宇' }, { key: 'room_number', label: '房间' },
      { key: 'host_name', label: '被访人', kind: 'person' }, { key: 'purpose', label: '来访事由' },
      { key: 'visit_time', label: '预约时间', kind: 'date' }, { key: 'status', label: '准入状态', kind: 'status' },
    ]}
  />
}
