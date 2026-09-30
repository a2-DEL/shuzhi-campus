import { BusinessModulePage } from '@/components/business/business-module-page'

export default function MaterialsPage() {
  return <BusinessModulePage
    domainKey="material"
    title="物资与备件保障中心"
    subtitle="库存阈值、缺货风险和申领状态来自正式租户业务表，为报修工单和现场服务提供可核验保障。"
    endpoint="/api/ai/business-records?domain=material"
    recordLabel="物资品类"
    columns={[
      { key: 'name', label: '物资名称' }, { key: 'category', label: '保障分类' },
      { key: 'quantity', label: '现有库存', kind: 'number' }, { key: 'unit', label: '单位' },
      { key: 'threshold', label: '安全阈值', kind: 'number' }, { key: 'status', label: '库存状态', kind: 'status' },
      { key: 'pending_requests', label: '待审申领', kind: 'number' }, { key: 'location', label: '存放位置' },
      { key: 'updated_at', label: '盘点时间', kind: 'date' },
    ]}
  />
}
