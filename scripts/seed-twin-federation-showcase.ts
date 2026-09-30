import './assert-isolated-test-environment.mjs'
import { config as loadDotEnv } from 'dotenv'
import { captureTwinSnapshot, runTwinScenario } from '@/lib/ai/platform/twin'
import { ensureFederationNode, ingestMultimodalAsset, reviewMultimodalObservation, runFederationJob } from '@/lib/ai/platform/federation'
import { getDevelopmentUser } from '@/lib/development-users'
import { getPostgresPool } from '@/storage/database/postgres'

function wav(seconds: number, frequencyMarker: number): Buffer {
  const sampleRate = 8_000, samples = sampleRate * seconds, dataSize = samples * 2, buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF',0); buffer.writeUInt32LE(36 + dataSize,4); buffer.write('WAVE',8); buffer.write('fmt ',12); buffer.writeUInt32LE(16,16); buffer.writeUInt16LE(1,20); buffer.writeUInt16LE(1,22); buffer.writeUInt32LE(sampleRate,24); buffer.writeUInt32LE(sampleRate * 2,28); buffer.writeUInt16LE(2,32); buffer.writeUInt16LE(16,34); buffer.write('data',36); buffer.writeUInt32LE(dataSize,40)
  for (let i=0;i<samples;i+=1) buffer.writeInt16LE(Math.round(Math.sin(i / frequencyMarker) * 1200),44+i*2)
  return buffer
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64')

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true }); loadDotEnv({ quiet: true })
  const user = getDevelopmentUser('admin'); if (!user?.school_id) throw new Error('development administrator unavailable')
  const pool = getPostgresPool()
  const assets = [
    { name: '东区公寓消防门现场照片-A.png', type: 'image/png', bytes: Buffer.concat([png,Buffer.from('photo-a')]), note: '现场人员确认：消防门闭门器区域，照片仅用于设备状态复核。' },
    { name: '创新中心空调机房照片-B.png', type: 'image/png', bytes: Buffer.concat([png,Buffer.from('photo-b')]), note: '现场人员确认：空调机房设备铭牌已脱敏。' },
    { name: '设备振动采样-A.wav', type: 'audio/wav', bytes: wav(1,9), note: '授权设备声学采样，不包含人员语音。' },
    { name: '设备振动采样-B.wav', type: 'audio/wav', bytes: wav(1,13), note: '授权设备声学采样，不包含声纹信息。' },
    { name: '大型活动保障检查表.txt', type: 'text/plain', bytes: Buffer.from('大型活动保障检查表\n场地：星云报告厅\n检查项：容量、安保、访客、通知回执、雨天预案\n状态：等待人工复核','utf8'), note: '项目组授权的活动保障文本证据。' },
    { name: '报修SLA现场交接记录.md', type: 'text/markdown', bytes: Buffer.from('# 报修 SLA 现场交接\n- 五分钟无人接单进入跨区域改派\n- 十五分钟内完成一级故障响应\n- 完成后必须回读业务状态','utf8'), note: '后勤中心授权的现场交接文档。' },
    { name: '疏散通道巡检片段-A.mp4', type: 'video/mp4', bytes: Buffer.from('00000018ftypisom0000showcase-video-a','utf8'), note: '授权巡检视频容器样本；当前不生成视觉语义结论。' },
    { name: '能源站设备巡检片段-B.webm', type: 'video/webm', bytes: Buffer.from([0x1a,0x45,0xdf,0xa3,...Buffer.from('showcase-video-b')]), note: '授权设备巡检视频容器样本。' },
  ]
  for (const item of assets) {
    const asset = await ingestMultimodalAsset(user, { name: item.name, contentType: item.type, bytes: item.bytes, sensitivity: 'INTERNAL', consentBasis: '企业演示隔离数据授权', annotation: item.note })
    for (const observation of asset.observations.filter((entry) => entry.status === 'CANDIDATE')) await reviewMultimodalObservation(user, observation.id, 'approve')
  }
  const capabilities = ['MULTIMODAL_METRICS','CAMPUS_RISK_AGGREGATION','RETRIEVAL_TELEMETRY']
  const local = await ensureFederationNode(user,{slug:'shuzhi-local-campus',name:'数智星图本校可信节点',nodeKind:'LOCAL',capabilities,privacyPolicy:{minimumGroupSize:5,maxEpsilon30Days:8}})
  const east = await ensureFederationNode(user,{slug:'sandbox-east-campus',name:'东部高校隔离沙箱节点',nodeKind:'SANDBOX',capabilities,privacyPolicy:{minimumGroupSize:5,maxEpsilon30Days:6}})
  const west = await ensureFederationNode(user,{slug:'sandbox-west-campus',name:'西部高校隔离沙箱节点',nodeKind:'SANDBOX',capabilities,privacyPolicy:{minimumGroupSize:5,maxEpsilon30Days:6}})
  for (const nodeId of [east,west]) await pool.query('DELETE FROM ai_federation_sandbox_records WHERE node_id=$1::uuid',[nodeId])
  for (const [nodeIndex,nodeId] of [east,west].entries()) for (let i=0;i<16;i+=1) await pool.query(`INSERT INTO ai_federation_sandbox_records(school_id,node_id,modality,metric,value,quality,observed_at,synthetic,metadata) VALUES($1::uuid,$2::uuid,$3,'asset_size_kb',$4,'valid',now()-($5||' hours')::interval,true,$6::jsonb)`,[user.school_id,nodeId,['IMAGE','AUDIO','DOCUMENT','VIDEO'][i%4],4.5+nodeIndex*1.2+i*0.35,i,JSON.stringify({dataset:'isolated-sandbox',production:false})])
  await pool.query("DELETE FROM ai_federation_jobs WHERE school_id=$1::uuid AND (name='校园多模态资产隐私聚合演示' OR name LIKE '多模态资产隐私聚合 ·%')",[user.school_id])
  const federation = await runFederationJob(user,{name:'校园多模态资产隐私聚合演示',jobType:'MULTIMODAL_METRICS',requestedModalities:['IMAGE','AUDIO','DOCUMENT','VIDEO'],minimumGroupSize:5,epsilonBudget:1.2})
  const model = await pool.query(`SELECT id FROM ai_twin_models WHERE school_id=$1::uuid AND slug='campus-operations-twin'`,[user.school_id])
  if (model.rows[0]) { await pool.query('DELETE FROM ai_twin_scenarios WHERE model_id=$1::uuid',[model.rows[0].id]); await pool.query('DELETE FROM ai_twin_snapshots WHERE model_id=$1::uuid',[model.rows[0].id]) }
  const snapshot = await captureTwinSnapshot(user)
  const simulation = await runTwinScenario(user,{name:'创新论坛 800 人联合保障推演',hypothesis:'增加报修增援、访客核验席位与通知升级，并实施能耗削峰，可降低大型活动期间校园运行风险。',snapshotId:snapshot.id,interventions:{repairCapacityDelta:4,energyReductionPct:12,notificationEscalation:true,visitorDeskDelta:2,eventAttendees:800}})
  console.log(`PASS twin/federation showcase seed: assets=${assets.length} nodes=3 signed=${federation.contributions.filter(item=>item.signatureVerified).length} twinQuality=${snapshot.dataQualityScore} risk=${simulation.baseline.campusRiskScore}->${simulation.projected.campusRiskScore}`)
  void local
}
main().catch((error)=>{console.error(error);process.exitCode=1})
