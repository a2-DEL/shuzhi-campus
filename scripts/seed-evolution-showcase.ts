import './assert-isolated-test-environment.mjs'
import { createHash } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import { approveEvolutionExperiment, runEvolutionEvaluation } from '@/lib/ai/platform/evolution'
import { getDevelopmentUser } from '@/lib/development-users'
import { getPostgresPool } from '@/storage/database/postgres'

const DATASET_ID = '74000000-0000-4000-8000-000000000001'
const SIGNAL_ID = '74000000-0000-4000-8000-000000000101'
const EXPERIMENT_ID = '75000000-0000-4000-8000-000000000001'

const cases = [
  { id: '74100000-0000-4000-8000-000000000001', key: 'event-venue', title: '大型活动场地联合保障', question: '周六举办大型活动，场地和安保要提前准备哪些材料？', expected: '大型活动场地', risk: 'high' },
  { id: '74100000-0000-4000-8000-000000000002', key: 'student-status', title: '休学退宿财务协同', question: '学籍管理中心审核休学申请，退宿验房完成后财务住宿费退款三个工作日到账。', expected: '学籍异动', risk: 'high' },
  { id: '74100000-0000-4000-8000-000000000003', key: 'repair-sla', title: '一级报修 SLA', question: '一级报修故障包括大面积停电，十五分钟响应，五分钟无人接单跨区域改派。', expected: '校园报修', risk: 'medium' },
  { id: '74100000-0000-4000-8000-000000000004', key: 'visitor-pass', title: '访客一次性凭证', question: '访客一次性通行凭证最长有效多久，何时可以生成？', expected: '访客准入', risk: 'critical' },
  { id: '74100000-0000-4000-8000-000000000005', key: 'notification-receipt', title: '通知回执闭环', question: '通知发布成功是否代表师生已收到，未确认时谁负责跟进？', expected: '通知发布', risk: 'medium' },
  { id: '74100000-0000-4000-8000-000000000006', key: 'agent-failure', title: 'Agent 故障失败关闭', question: '模型通道异常时能否伪造业务成功，Agent 长时间无进展应先检查什么？', expected: '白泽模型网关', risk: 'critical' },
] as const

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true }); loadDotEnv({ quiet: true })
  const user = getDevelopmentUser('ai_ops')
  if (!user?.school_id) throw new Error('AI operations development user is unavailable')
  const pool = getPostgresPool()
  await pool.query(
    `INSERT INTO ai_evolution_datasets(id,school_id,slug,name,description,target_type,version,status,created_by,metadata)
     VALUES($1::uuid,$2::uuid,'campus-retrieval-golden-set','校园关键业务检索黄金基准集','覆盖场地、学籍、报修、访客、通知与 AI 运维的固定回归样本；每次候选发布必须重新执行。','RETRIEVAL',1,'ACTIVE',$3,$4::jsonb)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='ACTIVE',updated_at=now()`,
    [DATASET_ID, user.school_id, user.id, JSON.stringify({ source: 'governed-showcase', immutableInputs: true })],
  )
  for (const item of cases) {
    await pool.query(
      `INSERT INTO ai_evolution_eval_cases(id,school_id,dataset_id,case_key,title,input,expected,risk_level,active)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7::jsonb,$8,true)
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,input=EXCLUDED.input,expected=EXCLUDED.expected,risk_level=EXCLUDED.risk_level,active=true`,
      [item.id, user.school_id, DATASET_ID, item.key, item.title, JSON.stringify({ question: item.question }), JSON.stringify({ titleIncludes: item.expected, maximumRank: 3 }), item.risk],
    )
  }
  const evidenceHash = createHash('sha256').update('governed-retrieval-improvement-signal-v1', 'utf8').digest('hex')
  await pool.query(
    `INSERT INTO ai_evolution_signals(id,school_id,source_type,source_id,signal_type,severity,status,summary,evidence_hash,metadata)
     VALUES($1::uuid,$2::uuid,'MANUAL','showcase-retrieval-quality-2026q3','MANUAL','medium','LINKED','业务问法持续口语化，需要在不降低制度关键词命中的前提下增强语义召回。',$3,$4::jsonb)
     ON CONFLICT(id) DO UPDATE SET summary=EXCLUDED.summary,evidence_hash=EXCLUDED.evidence_hash,updated_at=now()`,
    [SIGNAL_ID, user.school_id, evidenceHash, JSON.stringify({ approvedByOperations: true, rawQueriesStored: false })],
  )
  await pool.query('DELETE FROM ai_evolution_releases WHERE experiment_id=$1::uuid', [EXPERIMENT_ID])
  await pool.query('DELETE FROM ai_evolution_eval_runs WHERE experiment_id=$1::uuid', [EXPERIMENT_ID])
  await pool.query('DELETE FROM ai_evolution_experiments WHERE id=$1::uuid', [EXPERIMENT_ID])
  await pool.query(
    `INSERT INTO ai_evolution_experiments(id,school_id,signal_id,dataset_id,target_type,target_id,baseline_version,candidate_version,hypothesis,change_summary,baseline_config,candidate_config,status,created_by)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'RETRIEVAL','knowledge.hybrid-ranking','baseline-v1','hybrid-rank-v2.1','在保持制度关键词命中与安全边界不变的条件下，小幅提高语义向量贡献可改善口语化业务问法。','词法权重下调 2 个百分点，语义向量权重上调 2 个百分点；图谱与权威来源权重保持不变。',$5::jsonb,$6::jsonb,'DRAFT',$7)`,
    [EXPERIMENT_ID, user.school_id, SIGNAL_ID, DATASET_ID, JSON.stringify({ weights: { lexical: 0.42, vector: 0.38, graph: 0.15, authority: 0.05 } }), JSON.stringify({ weights: { lexical: 0.40, vector: 0.40, graph: 0.15, authority: 0.05 } }), user.id],
  )
  const evaluated = await runEvolutionEvaluation(user, EXPERIMENT_ID)
  if (evaluated.status !== 'PASSED') throw new Error(`canonical evolution evaluation failed: ${evaluated.status}`)
  const release = await approveEvolutionExperiment(user, EXPERIMENT_ID, 'AI 运维管理员已核验 6 个关键业务样本、100% 安全得分与完整证据哈希，批准语义召回微调进入受控生产。')
  console.log(`PASS evolution showcase seed: cases=${cases.length} eval=${evaluated.status} safety=${evaluated.safetyScore} active=${release.version}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
