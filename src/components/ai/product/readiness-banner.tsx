import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from 'lucide-react'
import type { AiSystemReadiness } from '@/lib/ai/product-types'
import { backendLabel } from '@/lib/ai/presentation'

export function ReadinessBanner({ readiness }: { readiness: AiSystemReadiness | null }) {
  if (!readiness) return null
  const ready = readiness.executionReady && readiness.modelReady && readiness.knowledgeReady
  return (
    <div className={`rounded-xl border p-4 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{ready ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className={`font-semibold ${ready ? 'text-emerald-900' : 'text-amber-900'}`}>{ready ? '核心能力全部就绪' : readiness.executionReady ? '业务执行就绪，智能能力部分可用' : '真实业务执行尚未就绪'}</p><span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">{backendLabel(readiness.businessPort)}</span></div>
          <p className={`mt-1 text-sm ${ready ? 'text-emerald-800' : 'text-amber-800'}`}>{readiness.message}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600"><span>模型探测：{readiness.modelReady ? '已通过' : readiness.modelConfigured ? '未通过或已过期' : '未配置，基础模式'}</span><span>知识库：{readiness.knowledgeReady ? `${readiness.publishedKnowledgeDocuments} 篇已发布` : '暂无可用文档'}</span><span className="inline-flex items-center gap-1"><Database className="h-3.5 w-3.5" />任务记录：{backendLabel(readiness.runtimeRepository)}</span><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />失败关闭，不伪造成功</span></div>
        </div>
      </div>
    </div>
  )
}
