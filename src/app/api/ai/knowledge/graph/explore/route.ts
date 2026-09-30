import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { exploreKnowledgeGraph, KnowledgeError } from '@/lib/ai/knowledge/service'

const exploreSchema = z.object({ focusId: z.string().uuid().optional(), search: z.string().trim().max(120).optional(), depth: z.number().int().min(1).max(4).optional(), fromId: z.string().uuid().optional(), toId: z.string().uuid().optional() }).strict()
function failure(error: unknown): NextResponse {
  if (error instanceof KnowledgeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_REQUEST' ? 400 : 503 })
  return NextResponse.json({ success: false, error: '知识图谱探索暂时不可用', code: 'GRAPH_EXPLORE_UNAVAILABLE' }, { status: 503 })
}
export async function GET(request: NextRequest) {
  const user=await getAuthUser(request);if(!user)return NextResponse.json({success:false,error:'Authentication required',code:'UNAUTHENTICATED'},{status:401})
  const parsed=exploreSchema.safeParse({focusId:request.nextUrl.searchParams.get('focusId')||undefined,search:request.nextUrl.searchParams.get('search')||undefined,depth:Number(request.nextUrl.searchParams.get('depth')||2)})
  if(!parsed.success)return NextResponse.json({success:false,error:'图谱探索参数无效',code:'INVALID_GRAPH_EXPLORE'},{status:400})
  try{return NextResponse.json({success:true,data:await exploreKnowledgeGraph(user,parsed.data)},{headers:{'Cache-Control':'no-store'}})}catch(error){return failure(error)}
}
export async function POST(request: NextRequest) {
  const user=await getAuthUser(request);if(!user)return NextResponse.json({success:false,error:'Authentication required',code:'UNAUTHENTICATED'},{status:401})
  const parsed=exploreSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success||!parsed.data.fromId||!parsed.data.toId)return NextResponse.json({success:false,error:'请选择路径起点和终点',code:'INVALID_GRAPH_PATH'},{status:400})
  try{return NextResponse.json({success:true,data:await exploreKnowledgeGraph(user,parsed.data)},{headers:{'Cache-Control':'no-store'}})}catch(error){return failure(error)}
}
