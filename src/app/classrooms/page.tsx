import { BusinessModulePage } from '@/components/business/business-module-page'

export default function ClassroomsPage() {
  return <BusinessModulePage
    domainKey="classroom"
    title="教学空间运营中心"
    subtitle="以容量、设施、实时状态、课程占用和预约冲突为统一事实源，为教学与大型活动提供可验证的空间保障。"
    endpoint="/api/ai/business-records?domain=classroom"
    skillId="classroom_book"
    agentTitle="教学空间预约"
    agentDescription="青鸾核验真实课表、预约冲突、容量与设施，审批后创建预约并回读业务状态。"
    agentParamMap={{ classroomId: 'id' }}
    recordLabel="教学空间"
    columns={[
      { key: 'full_name', label: '空间名称' }, { key: 'building', label: '所在楼宇' },
      { key: 'floor', label: '楼层', kind: 'number' }, { key: 'capacity', label: '承载人数', kind: 'number' },
      { key: 'facilities', label: '核心设施', kind: 'list' }, { key: 'active_bookings', label: '在途预约', kind: 'number' },
      { key: 'status', label: '当前状态', kind: 'status' },
    ]}
  />
}
