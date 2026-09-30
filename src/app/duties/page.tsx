import { BusinessModulePage } from '@/components/business/business-module-page'

export default function DutiesPage() {
  return <BusinessModulePage
    domainKey="hygiene"
    title="卫生检查与整改闭环"
    subtitle="检查证据、规则分数、责任人、截止时间、整改提交和复核结果在同一条业务链中完整留痕。"
    endpoint="/api/ai/business-records?domain=hygiene"
    skillId="hygiene_rectification_create"
    agentTitle="卫生整改协调"
    agentDescription="墨龟从真实检查证据创建确定性整改任务；AI 评分只作建议，不覆盖正式规则分数。"
    agentParamMap={{ inspectionId: 'inspection_id', assigneeId: 'assignee_id' }}
    recordLabel="整改任务"
    columns={[
      { key: 'location', label: '检查位置' }, { key: 'deterministic_score', label: '规则分数', kind: 'number' },
      { key: 'ai_advisory_score', label: 'AI 建议分', kind: 'number' }, { key: 'severity', label: '重要程度', kind: 'status' },
      { key: 'assignee_name', label: '整改责任人', kind: 'person' }, { key: 'due_at', label: '完成时限', kind: 'date' },
      { key: 'status', label: '整改状态', kind: 'status' }, { key: 'updated_at', label: '最近更新', kind: 'date' },
    ]}
  />
}
