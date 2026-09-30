import { BusinessModulePage } from '@/components/business/business-module-page'

export default function LostFoundPage() {
  return <BusinessModulePage
    domainKey="lost_found"
    title="失物服务与隐私核验中心"
    subtitle="智能匹配可以提高效率，但所有权确认必须由人完成；系统只保留必要证据并最小化隐私暴露。"
    endpoint="/api/ai/business-records?domain=lost_found"
    skillId="lost_found_claim"
    agentTitle="隐私安全认领"
    agentDescription="獬豸负责边界核验与证据留痕，只有人工确认身份和物品特征后才能完成认领。"
    agentParamMap={{ itemId: 'id' }}
    recordLabel="失物服务记录"
    columns={[
      { key: 'item_name', label: '物品名称' }, { key: 'item_type', label: '物品分类' },
      { key: 'type', label: '登记类型', kind: 'status' }, { key: 'location', label: '相关地点' },
      { key: 'reporter_name', label: '登记人', kind: 'person' }, { key: 'claimer_name', label: '认领人', kind: 'person' },
      { key: 'status', label: '服务状态', kind: 'status' }, { key: 'created_at', label: '登记时间', kind: 'date' },
    ]}
  />
}
