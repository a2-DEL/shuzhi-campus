import { BusinessModulePage } from '@/components/business/business-module-page'

export default function DormitoriesPage() {
  return <BusinessModulePage
    domainKey="dormitory"
    title="宿舍安全事件作战中心"
    subtitle="IoT 与规则只负责发现异常；宿管现场复核、整改或升级处置后，系统才形成正式结论。"
    endpoint="/api/ai/business-records?domain=dorm_safety"
    skillId="dorm_safety_confirm"
    agentTitle="宿舍安全现场复核"
    agentDescription="墨龟协调现场核验与后续整改，AI 不代替宿管作出处罚性判断，所有确认均留存人员和证据。"
    agentParamMap={{ eventId: 'id' }}
    recordLabel="安全事件"
    columns={[
      { key: 'building_name', label: '楼宇' }, { key: 'room_number', label: '房间' },
      { key: 'event_type', label: '事件类型' }, { key: 'source', label: '发现来源', kind: 'status' },
      { key: 'severity', label: '严重程度', kind: 'status' }, { key: 'status', label: '处置状态', kind: 'status' },
      { key: 'confirmed_by_name', label: '现场确认人', kind: 'person' }, { key: 'created_at', label: '发现时间', kind: 'date' },
    ]}
  />
}
