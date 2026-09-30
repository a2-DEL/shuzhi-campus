import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({path:'.env.local',quiet:true})
const base=process.env.AI_PLATFORM_TEST_BASE_URL||'http://localhost:3100';let assertions=0;const expect=(v,m)=>{assert.ok(v,m);assertions++}
async function request(route,cookie){const response=await fetch(`${base}${route}`,{headers:cookie?{cookie}:{},signal:AbortSignal.timeout(90000)});let body=null;try{body=await response.json()}catch{body=await response.text()}return{response,body}}
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'admin',password:'123456'}),signal:AbortSignal.timeout(90000)});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0]||''
const endpoints=['/api/ai/workflows','/api/ai/extensions','/api/ai/knowledge','/api/ai/knowledge/vector','/api/ai/collaboration','/api/ai/knowledge/graph/explore','/api/ai/evolution','/api/ai/twin','/api/ai/multimodal','/api/ai/federation']
for(const endpoint of endpoints){const result=await request(endpoint,cookie);expect(result.response.status===200&&result.body?.success,`${endpoint} integrated API unavailable`)}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const result=await pool.query(`SELECT
(SELECT count(*)::int FROM ai_workflows WHERE status='PUBLISHED') workflows,
(SELECT count(*)::int FROM skill_versions WHERE status='published') skills,
(SELECT count(*)::int FROM ai_plugins WHERE status='PUBLISHED') plugins,
(SELECT count(*)::int FROM ai_mcp_tools WHERE status='AVAILABLE') mcp_tools,
(SELECT count(*)::int FROM ai_knowledge_documents WHERE status='PUBLISHED') documents,
(SELECT count(*)::int FROM ai_knowledge_chunks) chunks,
(SELECT count(*)::int FROM ai_knowledge_relations WHERE status='PUBLISHED') relations,
(SELECT count(*)::int FROM ai_collaboration_rooms) rooms,
(SELECT count(*)::int FROM ai_collaboration_deliverables) deliverables,
(SELECT count(*)::int FROM ai_evolution_eval_cases WHERE active) eval_cases,
(SELECT count(*)::int FROM ai_evolution_releases WHERE status='ACTIVE') active_releases,
(SELECT count(*)::int FROM ai_twin_snapshots) twin_snapshots,
(SELECT count(*)::int FROM ai_twin_simulation_runs WHERE status='COMPLETED') twin_runs,
(SELECT count(*)::int FROM ai_multimodal_assets WHERE status='VERIFIED') verified_assets,
(SELECT count(*)::int FROM ai_federation_nodes WHERE status='ACTIVE') federation_nodes,
(SELECT count(*)::int FROM ai_federation_contributions WHERE status='ACCEPTED' AND signature_verified) verified_contributions,
(SELECT count(*)::int FROM ai_federation_nodes WHERE node_kind='REMOTE' AND status='ACTIVE') remote_nodes`)
const c=result.rows[0];expect(c.workflows>=2&&c.skills===9&&c.plugins>=1&&c.mcp_tools===3,'workflow/Skill/plugin/MCP canonical control plane incomplete');expect(c.documents===10&&c.chunks===10&&c.relations===15,'knowledge/vector/graph canonical corpus incomplete');expect(c.rooms>=1&&c.deliverables>=3,'multi-Agent collaboration office incomplete');expect(c.eval_cases===6&&c.active_releases===1,'governed self-evolution release incomplete');expect(c.twin_snapshots>=1&&c.twin_runs>=1,'digital twin canonical simulation incomplete');expect(c.verified_assets===8&&c.federation_nodes===3&&c.verified_contributions>=3,'multimodal/federation canonical evidence incomplete');expect(c.remote_nodes===0,'sandbox federation is falsely represented as remote production')
const assets=await pool.query('SELECT object_key,sha256 FROM ai_multimodal_assets');for(const asset of assets.rows){const file=path.resolve(process.cwd(),'.runtime-data','multimodal',asset.object_key);expect(file.startsWith(path.resolve(process.cwd(),'.runtime-data')+path.sep),`asset path escaped private store: ${asset.object_key}`);await access(file)}
const pages=['workflows','skills','knowledge','collaboration','graph','learning','twin','ecosystem'];for(const page of pages){const source=await readFile(`src/app/ai-agents/${page}/page.tsx`,'utf8');expect(!/<pre\b|<code\b|font-mono/.test(source),`${page} page exposes code-oriented UI`)}
const menu=await readFile('src/lib/menu-config.ts','utf8');for(const route of ['/ai-agents/workflows','/ai-agents/skills','/ai-agents/knowledge','/ai-agents/collaboration','/ai-agents/graph','/ai-agents/learning','/ai-agents/twin','/ai-agents/ecosystem'])expect(menu.includes(route),`menu missing ${route}`)
await pool.end();console.log(`PASS AI platform integration: APIs=${endpoints.length} workflows>=2 skills=9 plugins>=1 MCP=3 knowledge=10 graph=15 evalCases=6 twin=live multimodal=8 federation=3 remoteProd=0 pagesNoCode=8 assertions=${assertions}`)
