import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyInternalMcpToken } from '@/lib/ai/platform/extensions'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

const rpcSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]), method: z.string().min(1).max(100), params: z.record(z.string(), z.unknown()).optional() }).strict()
const schoolSchema = z.string().uuid()
const TOOLS = [
  { name: 'campus_operational_status', title: '校园运行态势快照', description: '读取当前学校租户的报修、教室、通知、宿舍安全和 Agent 任务摘要。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, _meta: { riskLevel: 'low', readOnly: true } },
  { name: 'knowledge_asset_summary', title: '知识资产治理摘要', description: '读取当前租户已发布文档、分块、实体、关系和检索审计数量。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, _meta: { riskLevel: 'low', readOnly: true } },
  { name: 'workflow_run_summary', title: '编排运行态势', description: '读取当前租户工作流、运行批次、待裁决和完成数量。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, _meta: { riskLevel: 'low', readOnly: true } },
]

function rpc(id: string | number, result: unknown, status = 200): NextResponse {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function rpcError(id: string | number | null, code: number, message: string, status = 400): NextResponse {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}
async function callTool(name: string, schoolId: string): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown> }> {
  const pool = getPostgresPool()
  if (name === 'campus_operational_status') {
    const result = await pool.query(`SELECT
      (SELECT count(*)::int FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted) repairs,
      (SELECT count(*)::int FROM repair_orders WHERE school_id=$1::uuid AND status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND NOT is_deleted) active_repairs,
      (SELECT count(*)::int FROM classrooms WHERE school_id=$1::uuid) classrooms,
      (SELECT count(*)::int FROM notifications WHERE school_id=$1::uuid AND status='PUBLISHED') published_notifications,
      (SELECT count(*)::int FROM dorm_safety_events WHERE school_id=$1::uuid AND status='PENDING_CONFIRMATION') pending_safety,
      (SELECT count(*)::int FROM ai_task_runs WHERE school_id=$1::uuid) agent_tasks`, [schoolId])
    const facts = result.rows[0]
    return { content: [{ type: 'text', text: `已完成租户运行态势回读：${facts.active_repairs} 张活跃报修、${facts.classrooms} 间教室、${facts.pending_safety} 项待确认宿舍安全事件、${facts.agent_tasks} 个 Agent 任务。` }], structuredContent: facts }
  }
  if (name === 'knowledge_asset_summary') {
    const result = await pool.query(`SELECT
      (SELECT count(*)::int FROM ai_knowledge_documents WHERE school_id=$1::uuid AND status='PUBLISHED') documents,
      (SELECT count(*)::int FROM ai_knowledge_chunks WHERE school_id=$1::uuid) chunks,
      (SELECT count(*)::int FROM ai_knowledge_entities WHERE school_id=$1::uuid AND status='PUBLISHED') entities,
      (SELECT count(*)::int FROM ai_knowledge_relations WHERE school_id=$1::uuid AND status='PUBLISHED') relations,
      (SELECT count(*)::int FROM ai_knowledge_retrievals WHERE school_id=$1::uuid) retrievals`, [schoolId])
    const facts = result.rows[0]
    return { content: [{ type: 'text', text: `知识底座已回读：${facts.documents} 份已发布文档、${facts.chunks} 个分块、${facts.entities} 个实体、${facts.relations} 条已审核关系。` }], structuredContent: facts }
  }
  if (name === 'workflow_run_summary') {
    const result = await pool.query(`SELECT
      (SELECT count(*)::int FROM ai_workflows WHERE school_id=$1::uuid) workflows,
      (SELECT count(*)::int FROM ai_workflow_runs WHERE school_id=$1::uuid) runs,
      (SELECT count(*)::int FROM ai_workflow_runs WHERE school_id=$1::uuid AND status='AWAITING_APPROVAL') awaiting_approval,
      (SELECT count(*)::int FROM ai_workflow_runs WHERE school_id=$1::uuid AND status='COMPLETED') completed`, [schoolId])
    const facts = result.rows[0]
    return { content: [{ type: 'text', text: `编排控制面已回读：${facts.workflows} 个工作流、${facts.runs} 个运行批次，其中 ${facts.awaiting_approval} 个等待人工裁决。` }], structuredContent: facts }
  }
  throw new Error('Unknown tool')
}

export async function POST(request: NextRequest) {
  if (!verifyInternalMcpToken(request.headers.get('x-shuzhi-mcp-token'))) return rpcError(null, -32001, 'MCP authentication failed', 401)
  if (!hasPostgresDatabaseUrl()) return rpcError(null, -32002, 'MCP backend unavailable', 503)
  const parsed = rpcSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return rpcError(null, -32600, 'Invalid JSON-RPC request')
  const { id, method, params = {} } = parsed.data
  if (method === 'initialize') return rpc(id, { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'shuzhi-baize-campus-mcp', version: '1.0.0' } })
  if (method === 'tools/list') return rpc(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : ''
    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {}
    const schoolId = schoolSchema.safeParse(args.schoolId)
    if (!schoolId.success) return rpcError(id, -32602, 'A valid tenant scope is required')
    if (!TOOLS.some((tool) => tool.name === name)) return rpcError(id, -32601, 'Tool not found', 404)
    try { return rpc(id, await callTool(name, schoolId.data)) } catch { return rpcError(id, -32603, 'Tool execution failed', 500) }
  }
  return rpcError(id, -32601, 'Method not found', 404)
}
