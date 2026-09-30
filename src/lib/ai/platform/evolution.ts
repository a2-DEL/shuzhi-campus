import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { UserRole, type User } from '@/types'
import {
  DEFAULT_KNOWLEDGE_RANKING_WEIGHTS,
  KNOWLEDGE_RANKING_TARGET,
  finalizeKnowledgeRetrieval,
  getActiveKnowledgeRanking,
  retrieveKnowledge,
  validateKnowledgeRankingWeights,
} from '@/lib/ai/knowledge/service'
import type { KnowledgeRankingWeights } from '@/lib/ai/knowledge/types'
import type {
  EvolutionDatasetView,
  EvolutionEvalRunView,
  EvolutionExperimentView,
  EvolutionOverview,
  EvolutionRankingWeights,
  EvolutionReleaseView,
  EvolutionSignalView,
} from './evolution-types'

export class EvolutionError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT', message: string) {
    super(message)
    this.name = 'EvolutionError'
  }
}

function requireOperator(user: User): { schoolId: string; user: User } {
  if (!user.school_id) throw new EvolutionError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.AI_OPS_ADMIN) throw new EvolutionError('FORBIDDEN', '只有 AI 系统运维管理员可以管理自进化发布闭环')
  if (!hasPostgresDatabaseUrl()) throw new EvolutionError('BACKEND_UNAVAILABLE', '治理型自进化需要 PostgreSQL 审计存储，当前系统保持失败关闭')
  return { schoolId: user.school_id, user }
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : new Date(0).toISOString()
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hashEvidence(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

function weightsFromConfig(value: unknown): EvolutionRankingWeights {
  const config = object(value)
  return validateKnowledgeRankingWeights(config.weights) as EvolutionRankingWeights
}

async function writeEvolutionAudit(client: PoolClient, input: { schoolId: string; userId: string; action: string; targetId: string; metadata: Record<string, unknown> }): Promise<void> {
  await client.query(
    `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
     VALUES($1::uuid,$2,$3,'EVOLUTION',$4,$5,$6::jsonb)`,
    [input.schoolId, input.userId, input.action, input.targetId, randomUUID().replaceAll('-', ''), JSON.stringify(input.metadata)],
  )
}

export async function collectEvolutionSignals(user: User): Promise<{ scanned: number; openSignals: number }> {
  const { schoolId } = requireOperator(user)
  const pool = getPostgresPool()
  const [feedback, invocations, retrievals, tasks] = await Promise.all([
    pool.query(`SELECT id,rating,outcome,status,task_id,created_at FROM ai_feedback_events WHERE school_id=$1::uuid AND (rating<=2 OR outcome IN ('incorrect','unsafe')) ORDER BY created_at DESC LIMIT 120`, [schoolId]),
    pool.query(`SELECT id,status,purpose,error_code,latency_ms,started_at FROM ai_model_invocations WHERE school_id=$1::uuid AND status IN ('FAILED','BLOCKED') ORDER BY started_at DESC LIMIT 120`, [schoolId]),
    pool.query(`SELECT id,status,route_mode,refusal_code,latency_ms,created_at FROM ai_knowledge_retrievals WHERE school_id=$1::uuid AND status IN ('REFUSED','FAILED') ORDER BY created_at DESC LIMIT 120`, [schoolId]),
    pool.query(`SELECT id,state,risk_level,skill_id,updated_at FROM ai_task_runs WHERE school_id=$1::uuid AND state IN ('FAILED','PARTIAL') ORDER BY updated_at DESC LIMIT 120`, [schoolId]),
  ])
  const candidates: Array<{ sourceType: string; sourceId: string; signalType: string; severity: string; summary: string; evidence: Record<string, unknown>; metadata: Record<string, unknown> }> = []
  for (const row of feedback.rows) candidates.push({
    sourceType: 'FEEDBACK', sourceId: String(row.id), signalType: 'NEGATIVE_FEEDBACK',
    severity: row.outcome === 'unsafe' ? 'critical' : Number(row.rating) <= 1 ? 'high' : 'medium',
    summary: row.outcome === 'unsafe' ? '用户反馈指出任务结果存在安全或权限风险，需进入专项复核。' : '用户反馈指出任务交付不准确或未达到预期，需纳入回归样本。',
    evidence: { id: row.id, rating: row.rating, outcome: row.outcome, status: row.status, taskId: row.task_id },
    metadata: { taskId: row.task_id, outcome: row.outcome, rating: Number(row.rating), rawCommentStored: false },
  })
  for (const row of invocations.rows) candidates.push({
    sourceType: 'MODEL_INVOCATION', sourceId: String(row.id), signalType: 'MODEL_FAILURE', severity: row.status === 'FAILED' ? 'high' : 'medium',
    summary: `模型网关在“${String(row.purpose)}”环节未形成可用结果，已转为可追踪改进信号。`,
    evidence: { id: row.id, status: row.status, purpose: row.purpose, errorCode: row.error_code, latencyMs: row.latency_ms },
    metadata: { purpose: row.purpose, errorCode: row.error_code ?? 'FAIL_CLOSED', promptStored: false },
  })
  for (const row of retrievals.rows) candidates.push({
    sourceType: 'RETRIEVAL', sourceId: String(row.id), signalType: 'RETRIEVAL_REFUSAL', severity: row.status === 'FAILED' ? 'high' : 'low',
    summary: row.status === 'FAILED' ? '知识检索执行失败，需排查索引、权限或存储链路。' : '知识检索因授权证据不足而拒答，可评估是否补充经过审核的知识资产。',
    evidence: { id: row.id, status: row.status, routeMode: row.route_mode, refusalCode: row.refusal_code, latencyMs: row.latency_ms },
    metadata: { routeMode: row.route_mode, refusalCode: row.refusal_code ?? 'INSUFFICIENT_EVIDENCE', rawQueryStored: false },
  })
  for (const row of tasks.rows) candidates.push({
    sourceType: 'TASK', sourceId: String(row.id), signalType: 'TASK_FAILURE', severity: row.risk_level === 'critical' ? 'critical' : 'high',
    summary: `受控 Agent 任务以“${String(row.state)}”结束，需复核技能契约、业务适配器与补偿策略。`,
    evidence: { id: row.id, state: row.state, riskLevel: row.risk_level, skillId: row.skill_id },
    metadata: { taskId: row.id, state: row.state, riskLevel: row.risk_level, skillId: row.skill_id },
  })
  for (const candidate of candidates) {
    await pool.query(
      `INSERT INTO ai_evolution_signals(school_id,source_type,source_id,signal_type,severity,status,summary,evidence_hash,metadata)
       VALUES($1::uuid,$2,$3,$4,$5,'OPEN',$6,$7,$8::jsonb)
       ON CONFLICT(school_id,source_type,source_id,signal_type) DO UPDATE SET severity=EXCLUDED.severity,summary=EXCLUDED.summary,evidence_hash=EXCLUDED.evidence_hash,metadata=EXCLUDED.metadata,updated_at=now()`,
      [schoolId, candidate.sourceType, candidate.sourceId, candidate.signalType, candidate.severity, candidate.summary, hashEvidence(candidate.evidence), JSON.stringify(candidate.metadata)],
    )
  }
  const count = await pool.query<{ count: number }>("SELECT count(*)::int count FROM ai_evolution_signals WHERE school_id=$1::uuid AND status='OPEN'", [schoolId])
  return { scanned: candidates.length, openSignals: Number(count.rows[0]?.count ?? 0) }
}

export async function createEvolutionExperiment(user: User, input: { datasetId?: string; signalId?: string; hypothesis: string; changeSummary: string; candidateWeights: KnowledgeRankingWeights; candidateVersion?: string }): Promise<EvolutionExperimentView> {
  const { schoolId } = requireOperator(user)
  const hypothesis = input.hypothesis.trim()
  const changeSummary = input.changeSummary.trim()
  if (hypothesis.length < 8 || hypothesis.length > 1_000) throw new EvolutionError('INVALID_REQUEST', '优化假设需为 8-1000 个字符')
  if (changeSummary.length < 4 || changeSummary.length > 1_000) throw new EvolutionError('INVALID_REQUEST', '变更说明需为 4-1000 个字符')
  const candidateWeights = validateKnowledgeRankingWeights(input.candidateWeights)
  const dataset = input.datasetId
    ? await getPostgresPool().query<{ id: string }>("SELECT id FROM ai_evolution_datasets WHERE id=$1::uuid AND school_id=$2::uuid AND status='ACTIVE'", [input.datasetId, schoolId])
    : await getPostgresPool().query<{ id: string }>("SELECT id FROM ai_evolution_datasets WHERE school_id=$1::uuid AND target_type='RETRIEVAL' AND status='ACTIVE' ORDER BY version DESC LIMIT 1", [schoolId])
  if (!dataset.rows[0]) throw new EvolutionError('NOT_FOUND', '没有可用的检索基准数据集')
  if (input.signalId) {
    const signal = await getPostgresPool().query('SELECT 1 FROM ai_evolution_signals WHERE id=$1::uuid AND school_id=$2::uuid', [input.signalId, schoolId])
    if (!signal.rows[0]) throw new EvolutionError('NOT_FOUND', '改进信号不存在')
  }
  const production = await getActiveKnowledgeRanking(schoolId)
  const candidateVersion = (input.candidateVersion?.trim() || `candidate-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 6)}`).slice(0, 80)
  try {
    const inserted = await getPostgresPool().query<{ id: string }>(
      `INSERT INTO ai_evolution_experiments(school_id,signal_id,dataset_id,target_type,target_id,baseline_version,candidate_version,hypothesis,change_summary,baseline_config,candidate_config,status,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,'RETRIEVAL',$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'DRAFT',$11) RETURNING id`,
      [schoolId, input.signalId ?? null, dataset.rows[0].id, KNOWLEDGE_RANKING_TARGET, production.version, candidateVersion, hypothesis, changeSummary, JSON.stringify({ weights: production.weights, governedRelease: production.governedRelease }), JSON.stringify({ weights: candidateWeights }), user.id],
    )
    if (input.signalId) await getPostgresPool().query("UPDATE ai_evolution_signals SET status='LINKED',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid", [input.signalId, schoolId])
    const overview = await getEvolutionOverview(user)
    return overview.experiments.find((item) => item.id === inserted.rows[0].id)!
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') throw new EvolutionError('CONFLICT', '候选版本已存在，请使用新的版本标识')
    throw error
  }
}

function expectedTitleFragments(value: unknown): string[] {
  const expected = object(value)
  const raw = expected.titleIncludes
  if (Array.isArray(raw)) return raw.map(String).map((item) => item.trim()).filter(Boolean)
  return typeof raw === 'string' && raw.trim() ? [raw.trim()] : []
}

function expectedRank(results: Array<{ documentTitle: string }>, fragments: string[]): number {
  if (fragments.length === 0) return 0
  const index = results.findIndex((item) => fragments.some((fragment) => item.documentTitle.includes(fragment)))
  return index < 0 ? 0 : index + 1
}

export async function runEvolutionEvaluation(user: User, experimentId: string): Promise<EvolutionEvalRunView> {
  const { schoolId } = requireOperator(user)
  const pool = getPostgresPool()
  const experimentResult = await pool.query<{
    id: string; dataset_id: string; target_id: string; status: string; baseline_config: unknown; candidate_config: unknown
  }>(`SELECT id,dataset_id,target_id,status,baseline_config,candidate_config FROM ai_evolution_experiments WHERE id=$1::uuid AND school_id=$2::uuid`, [experimentId, schoolId])
  const experiment = experimentResult.rows[0]
  if (!experiment) throw new EvolutionError('NOT_FOUND', '优化实验不存在')
  if (['APPROVED','REJECTED','ROLLED_BACK'].includes(experiment.status)) throw new EvolutionError('CONFLICT', '已结束的实验不能重新执行评测')
  if (experiment.target_id !== KNOWLEDGE_RANKING_TARGET) throw new EvolutionError('INVALID_REQUEST', '当前评测器仅接受知识混合检索排序目标')
  const baselineWeights = weightsFromConfig(experiment.baseline_config)
  const candidateWeights = weightsFromConfig(experiment.candidate_config)
  const cases = await pool.query<{ id: string; title: string; input: unknown; expected: unknown; risk_level: string }>(
    `SELECT id,title,input,expected,risk_level FROM ai_evolution_eval_cases WHERE school_id=$1::uuid AND dataset_id=$2::uuid AND active ORDER BY case_key`,
    [schoolId, experiment.dataset_id],
  )
  if (cases.rows.length === 0) throw new EvolutionError('CONFLICT', '基准数据集没有可执行样本')
  const run = await pool.query<{ id: string; started_at: unknown }>(
    `INSERT INTO ai_evolution_eval_runs(school_id,experiment_id,dataset_id,status,case_count,executed_by) VALUES($1::uuid,$2::uuid,$3::uuid,'RUNNING',$4,$5) RETURNING id,started_at`,
    [schoolId, experimentId, experiment.dataset_id, cases.rows.length, user.id],
  )
  const runId = run.rows[0].id
  await pool.query("UPDATE ai_evolution_experiments SET status='EVALUATING',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid", [experimentId, schoolId])
  try {
    const caseMetrics: Array<Record<string, unknown>> = []
    let passedCases = 0
    let safetyPasses = 0
    let baselineScoreTotal = 0
    let candidateScoreTotal = 0
    let baselineLatency = 0
    let candidateLatency = 0
    for (const evalCase of cases.rows) {
      const input = object(evalCase.input)
      const question = typeof input.question === 'string' ? input.question.trim() : ''
      if (question.length < 2) throw new EvolutionError('INVALID_REQUEST', `评测样本“${evalCase.title}”没有有效问题`)
      const fragments = expectedTitleFragments(evalCase.expected)
      const maximumRank = Math.min(8, Math.max(1, Number(object(evalCase.expected).maximumRank ?? 3)))
      const baseline = await retrieveKnowledge(user, question, { weights: baselineWeights, evaluation: { experimentId, caseId: evalCase.id, variant: 'baseline' } })
      await finalizeKnowledgeRetrieval({ retrievalId: baseline.id, schoolId, status: baseline.results.length ? 'ANSWERED' : 'REFUSED', citationCount: baseline.results.length, refusalCode: baseline.results.length ? undefined : 'EVALUATION_NO_MATCH', latencyMs: baseline.latencyMs })
      const candidate = await retrieveKnowledge(user, question, { weights: candidateWeights, evaluation: { experimentId, caseId: evalCase.id, variant: 'candidate' } })
      await finalizeKnowledgeRetrieval({ retrievalId: candidate.id, schoolId, status: candidate.results.length ? 'ANSWERED' : 'REFUSED', citationCount: candidate.results.length, refusalCode: candidate.results.length ? undefined : 'EVALUATION_NO_MATCH', latencyMs: candidate.latencyMs })
      const baselineRank = expectedRank(baseline.results, fragments)
      const candidateRank = expectedRank(candidate.results, fragments)
      const baselineCaseScore = baselineRank > 0 ? 1 / baselineRank : 0
      const candidateCaseScore = candidateRank > 0 ? 1 / candidateRank : 0
      const citedDocumentIds = [...new Set(candidate.results.map((item) => item.documentId))]
      const tenantEvidenceCount = citedDocumentIds.length === 0 ? 0 : Number((await pool.query<{ count: number }>(`SELECT count(*)::int count FROM ai_knowledge_documents WHERE school_id=$1::uuid AND id=ANY($2::uuid[]) AND status='PUBLISHED'`, [schoolId, citedDocumentIds])).rows[0]?.count ?? 0)
      const safetyPassed = citedDocumentIds.length > 0 && tenantEvidenceCount === citedDocumentIds.length
      const passed = candidateRank > 0 && candidateRank <= maximumRank
      if (passed) passedCases += 1
      if (safetyPassed) safetyPasses += 1
      baselineScoreTotal += baselineCaseScore
      candidateScoreTotal += candidateCaseScore
      baselineLatency += baseline.latencyMs
      candidateLatency += candidate.latencyMs
      caseMetrics.push({
        caseId: evalCase.id, title: evalCase.title, riskLevel: evalCase.risk_level, maximumRank,
        baselineRank, candidateRank, baselineScore: baselineCaseScore, candidateScore: candidateCaseScore,
        baselineTopScore: baseline.topScore, candidateTopScore: candidate.topScore, passed, safetyPassed,
        baselineRetrievalId: baseline.id, candidateRetrievalId: candidate.id, rawQueryStored: false,
      })
    }
    const caseCount = cases.rows.length
    const baselineScore = baselineScoreTotal / caseCount
    const candidateScore = candidateScoreTotal / caseCount
    const safetyScore = safetyPasses / caseCount
    const latencyDeltaMs = Math.round(candidateLatency / caseCount - baselineLatency / caseCount)
    const passRate = passedCases / caseCount
    const qualityGate = candidateScore + 0.000001 >= baselineScore && safetyScore === 1 && passRate >= 0.8
    const metrics = {
      method: 'actual-acl-scoped-retrieval-mrr', qualityGate: { candidateNotWorse: candidateScore + 0.000001 >= baselineScore, safetyPerfect: safetyScore === 1, minimumCasePassRate: 0.8, actualPassRate: passRate },
      averageBaselineLatencyMs: Math.round(baselineLatency / caseCount), averageCandidateLatencyMs: Math.round(candidateLatency / caseCount), cases: caseMetrics,
    }
    const evidenceHash = hashEvidence({ experimentId, datasetId: experiment.dataset_id, baselineWeights, candidateWeights, metrics })
    const status = qualityGate ? 'PASSED' : 'FAILED'
    await pool.query(
      `UPDATE ai_evolution_eval_runs SET status=$2,passed_cases=$3,baseline_score=$4,candidate_score=$5,safety_score=$6,latency_delta_ms=$7,cost_delta_ratio=0,metrics=$8::jsonb,evidence_hash=$9,completed_at=now() WHERE id=$1::uuid`,
      [runId, status, passedCases, baselineScore, candidateScore, safetyScore, latencyDeltaMs, JSON.stringify(metrics), evidenceHash],
    )
    await pool.query(`UPDATE ai_evolution_experiments SET status=$2,updated_at=now() WHERE id=$1::uuid AND school_id=$3::uuid`, [experimentId, qualityGate ? 'READY_FOR_REVIEW' : 'DRAFT', schoolId])
    const overview = await getEvolutionOverview(user)
    return overview.experiments.find((item) => item.id === experimentId)?.latestRun ?? { id: runId, status, caseCount, passedCases, baselineScore, candidateScore, safetyScore, latencyDeltaMs, evidenceHash, startedAt: timestamp(run.rows[0].started_at), completedAt: new Date().toISOString() }
  } catch (error) {
    await pool.query("UPDATE ai_evolution_eval_runs SET status='BLOCKED',metrics=$2::jsonb,evidence_hash=$3,completed_at=now() WHERE id=$1::uuid", [runId, JSON.stringify({ reasonCode: error instanceof EvolutionError ? error.code : 'EVALUATION_FAILURE', rawInputStored: false }), hashEvidence({ runId, error: error instanceof EvolutionError ? error.code : 'EVALUATION_FAILURE' })])
    await pool.query("UPDATE ai_evolution_experiments SET status='DRAFT',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid", [experimentId, schoolId])
    throw error
  }
}

export async function approveEvolutionExperiment(user: User, experimentId: string, releaseNotes: string): Promise<EvolutionReleaseView> {
  const { schoolId } = requireOperator(user)
  const notes = releaseNotes.trim()
  if (notes.length < 8 || notes.length > 2_000) throw new EvolutionError('INVALID_REQUEST', '发布说明需为 8-2000 个字符')
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const experiment = await client.query<{ id: string; signal_id: string | null; target_type: string; target_id: string; candidate_version: string; candidate_config: unknown; status: string }>(
      `SELECT id,signal_id,target_type,target_id,candidate_version,candidate_config,status FROM ai_evolution_experiments WHERE id=$1::uuid AND school_id=$2::uuid FOR UPDATE`, [experimentId, schoolId],
    )
    const row = experiment.rows[0]
    if (!row) throw new EvolutionError('NOT_FOUND', '优化实验不存在')
    if (row.status !== 'READY_FOR_REVIEW') throw new EvolutionError('CONFLICT', '实验尚未通过基准评测，不能发布')
    const evaluated = await client.query<{ status: string; baseline_score: string; candidate_score: string; safety_score: string; evidence_hash: string }>(
      `SELECT status,baseline_score,candidate_score,safety_score,evidence_hash FROM ai_evolution_eval_runs WHERE experiment_id=$1::uuid AND school_id=$2::uuid ORDER BY started_at DESC LIMIT 1 FOR UPDATE`, [experimentId, schoolId],
    )
    const latest = evaluated.rows[0]
    if (!latest || latest.status !== 'PASSED' || Number(latest.safety_score) !== 1 || Number(latest.candidate_score) + 0.000001 < Number(latest.baseline_score)) throw new EvolutionError('CONFLICT', '最新评测证据未满足质量与安全闸门')
    const weights = weightsFromConfig(row.candidate_config)
    await client.query("UPDATE ai_evolution_releases SET status='ROLLED_BACK',rolled_back_by=$3,rolled_back_at=now() WHERE school_id=$1::uuid AND target_id=$2 AND status='ACTIVE'", [schoolId, row.target_id, user.id])
    const released = await client.query<{ id: string }>(
      `INSERT INTO ai_evolution_releases(school_id,experiment_id,target_type,target_id,version,status,release_notes,config,activated_by)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,'ACTIVE',$6,$7::jsonb,$8) RETURNING id`,
      [schoolId, experimentId, row.target_type, row.target_id, row.candidate_version, notes, JSON.stringify({ weights, evalEvidenceHash: latest.evidence_hash }), user.id],
    )
    await client.query("UPDATE ai_evolution_experiments SET status='APPROVED',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1::uuid", [experimentId, user.id])
    if (row.signal_id) await client.query("UPDATE ai_evolution_signals SET status='RESOLVED',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid", [row.signal_id, schoolId])
    await writeEvolutionAudit(client, { schoolId, userId: user.id, action: 'EVOLUTION_RELEASE_ACTIVATED', targetId: row.target_id, metadata: { releaseId: released.rows[0].id, experimentId, version: row.candidate_version, evalEvidenceHash: latest.evidence_hash, humanApproved: true } })
    await client.query('COMMIT')
    const overview = await getEvolutionOverview(user)
    return overview.releases.find((item) => item.id === released.rows[0].id)!
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof EvolutionError) throw error
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') throw new EvolutionError('CONFLICT', '该候选版本已发布或目标已有并发发布')
    throw error
  } finally { client.release() }
}

export async function rejectEvolutionExperiment(user: User, experimentId: string, reason: string): Promise<EvolutionExperimentView> {
  const { schoolId } = requireOperator(user)
  const reviewed = await getPostgresPool().query<{ id: string }>(
    `UPDATE ai_evolution_experiments SET status='REJECTED',reviewed_by=$2,reviewed_at=now(),updated_at=now(),change_summary=change_summary || $3
     WHERE id=$1::uuid AND school_id=$4::uuid AND status IN ('DRAFT','READY_FOR_REVIEW') RETURNING id`,
    [experimentId, user.id, reason.trim() ? `\n复核退回：${reason.trim().slice(0, 500)}` : '\n复核退回。', schoolId],
  )
  if (!reviewed.rows[0]) throw new EvolutionError('CONFLICT', '实验不存在或当前状态不能退回')
  return (await getEvolutionOverview(user)).experiments.find((item) => item.id === experimentId)!
}

export async function rollbackEvolutionRelease(user: User, releaseId: string, reason: string): Promise<EvolutionReleaseView> {
  const { schoolId } = requireOperator(user)
  const rollbackReason = reason.trim()
  if (rollbackReason.length < 4 || rollbackReason.length > 500) throw new EvolutionError('INVALID_REQUEST', '回滚原因需为 4-500 个字符')
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const release = await client.query<{ id: string; experiment_id: string; target_id: string; version: string }>("SELECT id,experiment_id,target_id,version FROM ai_evolution_releases WHERE id=$1::uuid AND school_id=$2::uuid AND status='ACTIVE' FOR UPDATE", [releaseId, schoolId])
    const row = release.rows[0]
    if (!row) throw new EvolutionError('NOT_FOUND', '当前生效版本不存在或已回滚')
    await client.query("UPDATE ai_evolution_releases SET status='ROLLED_BACK',rolled_back_by=$2,rolled_back_at=now(),release_notes=release_notes || $3 WHERE id=$1::uuid", [releaseId, user.id, `\n回滚原因：${rollbackReason}`])
    await client.query("UPDATE ai_evolution_experiments SET status='ROLLED_BACK',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1::uuid", [row.experiment_id, user.id])
    await writeEvolutionAudit(client, { schoolId, userId: user.id, action: 'EVOLUTION_RELEASE_ROLLED_BACK', targetId: row.target_id, metadata: { releaseId, experimentId: row.experiment_id, version: row.version, reasonHash: hashEvidence(rollbackReason), fallbackVersion: 'baseline-v1', humanApproved: true } })
    await client.query('COMMIT')
    return (await getEvolutionOverview(user)).releases.find((item) => item.id === releaseId)!
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

function mapRun(row: Record<string, unknown>): EvolutionEvalRunView | undefined {
  if (!row.run_id) return undefined
  return {
    id: String(row.run_id), status: String(row.run_status) as EvolutionEvalRunView['status'], caseCount: Number(row.case_count ?? 0), passedCases: Number(row.passed_cases ?? 0),
    baselineScore: row.baseline_score == null ? undefined : Number(row.baseline_score), candidateScore: row.candidate_score == null ? undefined : Number(row.candidate_score), safetyScore: row.safety_score == null ? undefined : Number(row.safety_score),
    latencyDeltaMs: row.latency_delta_ms == null ? undefined : Number(row.latency_delta_ms), evidenceHash: typeof row.evidence_hash === 'string' ? row.evidence_hash : undefined,
    startedAt: timestamp(row.run_started_at), completedAt: row.completed_at ? timestamp(row.completed_at) : undefined,
  }
}

function mapRelease(row: Record<string, unknown>): EvolutionReleaseView {
  return {
    id: String(row.id), experimentId: String(row.experiment_id), targetId: String(row.target_id), version: String(row.version), status: String(row.status) as EvolutionReleaseView['status'],
    releaseNotes: String(row.release_notes), weights: weightsFromConfig(row.config), activatedByName: String(row.activated_by_name ?? 'AI 运维管理员'), activatedAt: timestamp(row.activated_at), rolledBackAt: row.rolled_back_at ? timestamp(row.rolled_back_at) : undefined,
  }
}

export async function getEvolutionOverview(user: User): Promise<EvolutionOverview> {
  const { schoolId } = requireOperator(user)
  const pool = getPostgresPool()
  const [signalsResult, datasetsResult, releasesResult, experimentsResult, metricResult, production] = await Promise.all([
    pool.query(`SELECT id,source_type,signal_type,severity,status,summary,evidence_hash,created_at,updated_at FROM ai_evolution_signals WHERE school_id=$1::uuid ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,created_at DESC LIMIT 80`, [schoolId]),
    pool.query(`SELECT d.id,d.slug,d.name,d.description,d.target_type,d.version,d.status,d.updated_at,count(c.id)::int case_count,count(c.id) FILTER (WHERE c.risk_level IN ('high','critical'))::int high_risk_cases FROM ai_evolution_datasets d LEFT JOIN ai_evolution_eval_cases c ON c.dataset_id=d.id AND c.active WHERE d.school_id=$1::uuid GROUP BY d.id ORDER BY d.updated_at DESC`, [schoolId]),
    pool.query(`SELECT r.*,u.name activated_by_name FROM ai_evolution_releases r LEFT JOIN users u ON u.id=r.activated_by WHERE r.school_id=$1::uuid ORDER BY r.activated_at DESC LIMIT 40`, [schoolId]),
    pool.query(`SELECT e.*,d.name dataset_name,creator.name created_by_name,reviewer.name reviewed_by_name,lr.id run_id,lr.status run_status,lr.case_count,lr.passed_cases,lr.baseline_score,lr.candidate_score,lr.safety_score,lr.latency_delta_ms,lr.evidence_hash,lr.started_at run_started_at,lr.completed_at FROM ai_evolution_experiments e JOIN ai_evolution_datasets d ON d.id=e.dataset_id LEFT JOIN users creator ON creator.id=e.created_by LEFT JOIN users reviewer ON reviewer.id=e.reviewed_by LEFT JOIN LATERAL (SELECT * FROM ai_evolution_eval_runs rr WHERE rr.experiment_id=e.id ORDER BY rr.started_at DESC LIMIT 1) lr ON true WHERE e.school_id=$1::uuid ORDER BY e.updated_at DESC LIMIT 80`, [schoolId]),
    pool.query<{ open_signals: number; datasets: number; cases: number; experiments: number; ready: number; active_releases: number; passed_runs: number; completed_runs: number }>(`SELECT (SELECT count(*)::int FROM ai_evolution_signals WHERE school_id=$1::uuid AND status='OPEN') open_signals,(SELECT count(*)::int FROM ai_evolution_datasets WHERE school_id=$1::uuid AND status='ACTIVE') datasets,(SELECT count(*)::int FROM ai_evolution_eval_cases WHERE school_id=$1::uuid AND active) cases,(SELECT count(*)::int FROM ai_evolution_experiments WHERE school_id=$1::uuid) experiments,(SELECT count(*)::int FROM ai_evolution_experiments WHERE school_id=$1::uuid AND status='READY_FOR_REVIEW') ready,(SELECT count(*)::int FROM ai_evolution_releases WHERE school_id=$1::uuid AND status='ACTIVE') active_releases,(SELECT count(*)::int FROM ai_evolution_eval_runs WHERE school_id=$1::uuid AND status='PASSED') passed_runs,(SELECT count(*)::int FROM ai_evolution_eval_runs WHERE school_id=$1::uuid AND status IN ('PASSED','FAILED')) completed_runs`, [schoolId]),
    getActiveKnowledgeRanking(schoolId),
  ])
  const releases = releasesResult.rows.map((row) => mapRelease(row as Record<string, unknown>))
  const releaseByExperiment = new Map(releases.map((release) => [release.experimentId, release]))
  const experiments: EvolutionExperimentView[] = experimentsResult.rows.map((source) => {
    const row = source as Record<string, unknown>
    return {
      id: String(row.id), signalId: typeof row.signal_id === 'string' ? row.signal_id : undefined, datasetId: String(row.dataset_id), datasetName: String(row.dataset_name), targetType: String(row.target_type), targetId: String(row.target_id),
      baselineVersion: String(row.baseline_version), candidateVersion: String(row.candidate_version), hypothesis: String(row.hypothesis), changeSummary: String(row.change_summary), baselineWeights: weightsFromConfig(row.baseline_config), candidateWeights: weightsFromConfig(row.candidate_config),
      status: String(row.status) as EvolutionExperimentView['status'], createdByName: String(row.created_by_name ?? 'AI 运维管理员'), reviewedByName: typeof row.reviewed_by_name === 'string' ? row.reviewed_by_name : undefined,
      createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), latestRun: mapRun(row), release: releaseByExperiment.get(String(row.id)),
    }
  })
  const signals: EvolutionSignalView[] = signalsResult.rows.map((row) => ({ id: String(row.id), sourceType: String(row.source_type), signalType: String(row.signal_type), severity: String(row.severity) as EvolutionSignalView['severity'], status: String(row.status) as EvolutionSignalView['status'], summary: String(row.summary), evidenceHash: String(row.evidence_hash), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) }))
  const datasets: EvolutionDatasetView[] = datasetsResult.rows.map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), description: String(row.description), targetType: String(row.target_type), version: Number(row.version), status: String(row.status), caseCount: Number(row.case_count), highRiskCases: Number(row.high_risk_cases), updatedAt: timestamp(row.updated_at) }))
  const metric = metricResult.rows[0]
  const activeRelease = releases.find((item) => item.status === 'ACTIVE' && item.targetId === KNOWLEDGE_RANKING_TARGET)
  return {
    persistent: true, operator: true, target: { id: KNOWLEDGE_RANKING_TARGET, name: '知识混合检索排序策略', defaultVersion: 'baseline-v1' },
    metrics: { openSignals: Number(metric?.open_signals ?? 0), benchmarkDatasets: Number(metric?.datasets ?? 0), benchmarkCases: Number(metric?.cases ?? 0), experiments: Number(metric?.experiments ?? 0), readyForReview: Number(metric?.ready ?? 0), activeReleases: Number(metric?.active_releases ?? 0), evaluationPassRate: Number(metric?.completed_runs ?? 0) > 0 ? Number(metric?.passed_runs ?? 0) / Number(metric?.completed_runs ?? 0) : 0 },
    production: { version: production.version, governedRelease: production.governedRelease, weights: production.weights as EvolutionRankingWeights, activatedAt: activeRelease?.activatedAt },
    guardrails: ['线上策略只接受通过固定基准集的候选版本', '安全得分必须为 100%，候选质量不得低于基线', '模型与 Agent 无权自行发布，必须由 AI 运维管理员人工审批', '发布记录、评测证据与回滚操作全程留痕', '回滚后立即恢复内置安全基线，不保留隐式漂移'],
    signals, datasets, experiments, releases,
  }
}

export const EVOLUTION_NEVER_AUTO_PUBLISHES = true
export const EVOLUTION_DEFAULT_WEIGHTS = { ...DEFAULT_KNOWLEDGE_RANKING_WEIGHTS }
