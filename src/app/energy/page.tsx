import { BusinessModulePage } from '@/components/business/business-module-page'

export default function EnergyPage() {
  return <BusinessModulePage
    domainKey="energy"
    title="能耗与设备健康中心"
    subtitle="计量质量先于算法判断；预测性维护只使用质量合格的正式读数，并保留来源、时间窗和可信度。"
    endpoint="/api/ai/business-records?domain=energy"
    skillId="maintenance_recommendation_create"
    agentTitle="预测性设备维护"
    agentDescription="烛照从质量合格的计量序列形成维护建议，人工裁决后写入正式维护台账并完成回读。"
    agentParamMap={{ assetId: 'asset_id' }}
    recordLabel="设备计量记录"
    statusKey="quality"
    columns={[
      { key: 'asset_code', label: '资产编码' }, { key: 'asset_name', label: '设备资产' },
      { key: 'asset_type', label: '设备类型' }, { key: 'metric', label: '计量指标' },
      { key: 'value', label: '当前读数', kind: 'number' }, { key: 'unit', label: '单位' },
      { key: 'quality', label: '数据质量', kind: 'status' }, { key: 'observed_at', label: '采集时间', kind: 'date' },
    ]}
  />
}
