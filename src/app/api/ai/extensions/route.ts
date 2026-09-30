import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import {
  createMcpServer, createPlugin, ExtensionPlatformError, getExtensionOverview,
  invokeMcpTool, invokePluginCapability, pluginManifestSchema, probeMcpServer, publishPlugin,
} from '@/lib/ai/platform/extensions'

const createPluginSchema = z.object({ action: z.literal('createPlugin'), name: z.string().trim().min(1).max(220), slug: z.string().trim().max(140).optional(), description: z.string().trim().max(1_000).optional(), publisher: z.string().trim().max(180).optional(), trustLevel: z.enum(['INTERNAL', 'VERIFIED', 'RESTRICTED']).optional(), manifest: pluginManifestSchema }).strict()
const publishPluginSchema = z.object({ action: z.literal('publishPlugin'), pluginId: z.string().uuid() }).strict()
const invokePluginSchema = z.object({ action: z.literal('invokePlugin'), pluginId: z.string().uuid(), capabilityId: z.string().trim().min(1).max(100), params: z.record(z.string(), z.unknown()).default({}) }).strict()
const createMcpSchema = z.object({ action: z.literal('createMcp'), name: z.string().trim().min(1).max(220), slug: z.string().trim().max(140).optional(), description: z.string().trim().max(1_000).optional(), endpoint: z.string().trim().min(1).max(2_000), transport: z.enum(['STREAMABLE_HTTP', 'SSE']).optional(), authMode: z.enum(['NONE', 'BEARER_ENV']).optional(), credentialRef: z.string().trim().max(120).optional(), trustLevel: z.enum(['INTERNAL', 'VERIFIED', 'RESTRICTED']).optional() }).strict()
const probeMcpSchema = z.object({ action: z.literal('probeMcp'), serverId: z.string().uuid() }).strict()
const callMcpSchema = z.object({ action: z.literal('callMcp'), serverId: z.string().uuid(), toolId: z.string().uuid(), arguments: z.record(z.string(), z.unknown()).default({}) }).strict()

function failure(error: unknown): NextResponse {
  if (error instanceof ExtensionPlatformError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : ['PROBE_FAILED', 'TOOL_FAILED'].includes(error.code) ? 502 : error.code === 'TOOL_BLOCKED' || error.code === 'ENDPOINT_BLOCKED' ? 422 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Extension platform request failed', error)
  return NextResponse.json({ success: false, error: '扩展治理平台暂时不可用', code: 'EXTENSION_PLATFORM_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await getExtensionOverview(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'createPlugin') {
      const parsed = createPluginSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '插件创建请求无效', code: 'INVALID_PLUGIN_REQUEST' }, { status: 400 })
      return NextResponse.json({ success: true, data: await createPlugin(user, parsed.data) }, { status: 201 })
    }
    if (body?.action === 'publishPlugin') {
      const parsed = publishPluginSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: '插件发布请求无效', code: 'INVALID_PLUGIN_PUBLISH' }, { status: 400 })
      return NextResponse.json({ success: true, data: await publishPlugin(user, parsed.data.pluginId) })
    }
    if (body?.action === 'invokePlugin') {
      const parsed = invokePluginSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: '插件调用请求无效', code: 'INVALID_PLUGIN_INVOKE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await invokePluginCapability(user, parsed.data.pluginId, parsed.data.capabilityId, parsed.data.params) })
    }
    if (body?.action === 'createMcp') {
      const parsed = createMcpSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'MCP 创建请求无效', code: 'INVALID_MCP_REQUEST' }, { status: 400 })
      return NextResponse.json({ success: true, data: await createMcpServer(user, parsed.data) }, { status: 201 })
    }
    if (body?.action === 'probeMcp') {
      const parsed = probeMcpSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: 'MCP 探测请求无效', code: 'INVALID_MCP_PROBE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await probeMcpServer(user, parsed.data.serverId) })
    }
    if (body?.action === 'callMcp') {
      const parsed = callMcpSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, error: 'MCP 工具调用请求无效', code: 'INVALID_MCP_CALL' }, { status: 400 })
      return NextResponse.json({ success: true, data: await invokeMcpTool(user, parsed.data.serverId, parsed.data.toolId, parsed.data.arguments) })
    }
    return NextResponse.json({ success: false, error: '不支持的扩展操作', code: 'UNSUPPORTED_EXTENSION_ACTION' }, { status: 400 })
  } catch (error) { return failure(error) }
}
