import './assert-isolated-test-environment.mjs'
import { config as loadDotEnv } from 'dotenv'
import { getDevelopmentUser } from '@/lib/development-users'
import { ingestKnowledgeDocument } from '@/lib/ai/knowledge/service'
import { getPostgresPool } from '@/storage/database/postgres'
import type { KnowledgeIngestInput } from '@/lib/ai/knowledge/types'

loadDotEnv({ path: '.env.local', quiet: true })
loadDotEnv({ quiet: true })

const SHOWCASE_VERSION = '2026.08-ai5-v1'
const documents: KnowledgeIngestInput[] = [
  {
    externalKey: 'showcase-event-venue-policy', title: '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u4e0e\u5b89\u4fdd\u8054\u52a8\u89c4\u7a0b', description: '\u89e3\u51b3\u573a\u5730\u3001\u5b89\u4fdd\u3001\u901a\u77e5\u548c\u5907\u7528\u65b9\u6848\u591a\u5934\u7533\u8bf7\u7684\u534f\u540c\u75db\u70b9\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u4e00\u3001\u7533\u8bf7\u65f6\u9650\u4e0e\u6750\u6599', '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u5fc5\u987b\u81f3\u5c11\u63d0\u524d\u4e94\u4e2a\u5de5\u4f5c\u65e5\u63d0\u4ea4\u3002\u6750\u6599\u5305\u62ec\u6d3b\u52a8\u65b9\u6848\u3001\u53c2\u52a0\u4eba\u6570\u3001\u821e\u53f0\u5e03\u5c40\u56fe\u3001\u5b89\u4fdd\u9884\u6848\u548c\u8054\u7cfb\u4eba\u3002\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u5fc5\u987b\u63d0\u4ea4\u96e8\u5929\u5907\u7528\u65b9\u6848\u3002', '\u4e8c\u3001\u534f\u540c\u5ba1\u6838', '\u540e\u52e4\u4e2d\u5fc3\u8d1f\u8d23\u6838\u9a8c\u573a\u5730\u6863\u671f\u548c\u8bbe\u65bd\u627f\u8f7d\u80fd\u529b\u3002\u4fdd\u536b\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u4eba\u6d41\u4e0a\u9650\u548c\u5b89\u4fdd\u9884\u6848\u3002\u573a\u5730\u51b2\u7a81\u65f6\uff0c\u767d\u6cfd\u5fc5\u987b\u7ed9\u51fa\u53ef\u7528\u66ff\u4ee3\u573a\u5730\uff0c\u4f46\u4e0d\u80fd\u4ee3\u66ff\u4eba\u5de5\u6279\u51c6\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'classroom-security' },
  },
  {
    externalKey: 'showcase-student-status-guide', title: '\u5b66\u7c4d\u5f02\u52a8\u3001\u5bbf\u820d\u9000\u5bbf\u4e0e\u8d22\u52a1\u7ed3\u7b97\u534f\u540c\u6307\u5357', description: '\u5c06\u4f11\u5b66\u3001\u9000\u5bbf\u3001\u8d39\u7528\u7ed3\u7b97\u62c6\u6210\u53ef\u8ffd\u8e2a\u7684\u5e76\u884c\u4efb\u52a1\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u5b66\u7c4d\u7ba1\u7406\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u4f11\u5b66\u7533\u8bf7\u3002\u5b66\u751f\u5e94\u63d0\u4ea4\u4f11\u5b66\u539f\u56e0\u3001\u8bc1\u660e\u6750\u6599\u3001\u8f85\u5bfc\u5458\u610f\u89c1\u548c\u9884\u8ba1\u590d\u5b66\u65f6\u95f4\u3002', '\u5bbf\u7ba1\u4e2d\u5fc3\u8d1f\u8d23\u5b8c\u6210\u9000\u5bbf\u9a8c\u623f\u3002\u9a8c\u623f\u9700\u8981\u6838\u5bf9\u94a5\u5319\u3001\u5bb6\u5177\u3001\u6c34\u7535\u8bfb\u6570\u548c\u635f\u574f\u8bb0\u5f55\u3002', '\u8d22\u52a1\u4e2d\u5fc3\u8d1f\u8d23\u6838\u7b97\u4f4f\u5bbf\u8d39\u9000\u6b3e\u3002\u53ea\u6709\u5b66\u7c4d\u5ba1\u6838\u548c\u9000\u5bbf\u9a8c\u623f\u90fd\u5b8c\u6210\u540e\uff0c\u8d22\u52a1\u624d\u80fd\u8fdb\u5165\u7ed3\u7b97\u3002\u9000\u6b3e\u9884\u8ba1\u4e09\u4e2a\u5de5\u4f5c\u65e5\u5230\u8d26\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'student-service' },
  },
  {
    externalKey: 'showcase-repair-sla-policy', title: '\u6821\u56ed\u62a5\u4fee\u5206\u7ea7\u54cd\u5e94\u4e0e SLA \u5904\u7f6e\u6807\u51c6', description: '\u7528\u660e\u786e\u54cd\u5e94\u65f6\u9650\u548c\u6539\u6d3e\u89c4\u5219\u89e3\u51b3\u5de5\u5355\u957f\u65f6\u95f4\u65e0\u4eba\u5904\u7406\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u4e00\u7ea7\u62a5\u4fee\u6545\u969c\u9002\u7528\u5341\u4e94\u5206\u949f\u54cd\u5e94\u65f6\u9650\u3002\u4e00\u7ea7\u6545\u969c\u5305\u62ec\u5927\u9762\u79ef\u505c\u7535\u3001\u4e3b\u7ba1\u9053\u7206\u88c2\u3001\u7535\u68af\u56f0\u4eba\u548c\u6d88\u9632\u8bbe\u65bd\u5931\u6548\u3002', '\u5de5\u5355\u4e94\u5206\u949f\u5185\u65e0\u4eba\u63a5\u5355\u65f6\uff0c\u540e\u52e4\u8c03\u5ea6\u4e2d\u5fc3\u8d1f\u8d23\u6267\u884c\u8de8\u533a\u57df\u6539\u6d3e\u3002\u6539\u6d3e\u5fc5\u987b\u8bb0\u5f55\u539f\u56e0\u3001\u65b0\u7ef4\u4fee\u4eba\u5458\u3001\u9884\u8ba1\u5230\u573a\u65f6\u95f4\u548c\u901a\u77e5\u56de\u6267\u3002', '\u7ef4\u4fee\u5b8c\u6210\u4e0d\u7b49\u4e8e\u5de5\u5355\u5b8c\u6210\u3002\u7cfb\u7edf\u5fc5\u987b\u56de\u8bfb\u6545\u969c\u72b6\u6001\u3001\u7528\u6237\u786e\u8ba4\u548c\u6750\u6599\u4f7f\u7528\u8bb0\u5f55\u540e\u624d\u80fd\u95ed\u73af\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'repair' },
  },
  {
    externalKey: 'showcase-visitor-policy', title: '\u8bbf\u5ba2\u51c6\u5165\u4e0e\u4e00\u6b21\u6027\u51ed\u8bc1\u7ba1\u7406\u529e\u6cd5', description: '\u89e3\u51b3\u8bbf\u5ba2\u8eab\u4efd\u3001\u6709\u6548\u671f\u548c\u5ba1\u8ba1\u8bb0\u5f55\u4e0d\u4e00\u81f4\u95ee\u9898\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u8bbf\u5ba2\u7533\u8bf7\u5fc5\u987b\u7ecf\u8fc7\u4eba\u5de5\u8eab\u4efd\u6838\u9a8c\u3002\u6838\u9a8c\u5185\u5bb9\u5305\u62ec\u8bc1\u4ef6\u4fe1\u606f\u3001\u6765\u8bbf\u4e8b\u7531\u3001\u88ab\u8bbf\u4eba\u3001\u8fdb\u51fa\u65f6\u95f4\u548c\u98ce\u9669\u8bb0\u5f55\u3002', '\u4e00\u6b21\u6027\u901a\u884c\u51ed\u8bc1\u6700\u957f\u6709\u6548\u56db\u5c0f\u65f6\u3002\u51ed\u8bc1\u5fc5\u987b\u5728\u4eba\u5de5\u6279\u51c6\u540e\u751f\u6210\uff0c\u8fc7\u671f\u6216\u4f7f\u7528\u540e\u7acb\u5373\u5931\u6548\u3002', '\u539f\u59cb\u8bc1\u4ef6\u53f7\u548c\u539f\u59cb\u4e8c\u7ef4\u7801\u4e0d\u5f97\u8fdb\u5165\u6a21\u578b\u63d0\u793a\u6216\u666e\u901a\u5ba1\u8ba1\u660e\u6587\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'visitor' },
  },
  {
    externalKey: 'showcase-dorm-safety-runbook', title: '\u5bbf\u820d\u5b89\u5168\u5f02\u5e38\u73b0\u573a\u590d\u6838\u624b\u518c', description: '\u5c06 IoT \u544a\u8b66\u4e0e\u5bbf\u7ba1\u73b0\u573a\u590d\u6838\u7ed3\u5408\uff0c\u9632\u6b62\u8bef\u62a5\u81ea\u52a8\u5904\u7f6e\u3002', sourceKind: 'RUNBOOK', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u5bbf\u7ba1\u5458\u8d1f\u8d23\u73b0\u573a\u590d\u6838\u70df\u611f\u5f02\u5e38\u3002\u590d\u6838\u5fc5\u987b\u8bb0\u5f55\u623f\u95f4\u53f7\u3001\u8bbe\u5907\u72b6\u6001\u3001\u73b0\u573a\u7167\u7247\u3001\u4eba\u5458\u60c5\u51b5\u548c\u590d\u6838\u65f6\u95f4\u3002', '\u4e25\u91cd\u5b89\u5168\u4e8b\u4ef6\u5fc5\u987b\u5347\u7ea7\u81f3\u5bbf\u7ba1\u4e2d\u5fc3\u8d1f\u8d23\u4eba\u3002\u6d89\u53ca\u706b\u60c5\u3001\u4eba\u5458\u88ab\u56f0\u6216\u8bbe\u5907\u6301\u7eed\u5931\u6548\u65f6\uff0c\u4e0d\u5141\u8bb8\u7531 Agent \u81ea\u52a8\u7ed3\u6848\u3002', '\u7cfb\u7edf\u5fc5\u987b\u540c\u65f6\u4fdd\u7559\u8bbe\u5907\u544a\u8b66\u3001\u73b0\u573a\u590d\u6838\u548c\u4eba\u5de5\u88c1\u51b3\u4e09\u7c7b\u8bc1\u636e\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'dorm-safety' },
  },
  {
    externalKey: 'showcase-energy-runbook', title: '\u80fd\u8017\u5f02\u5e38\u4e0e\u9884\u6d4b\u6027\u7ef4\u62a4\u8fd0\u884c\u624b\u518c', description: '\u9632\u6b62\u4f4e\u8d28\u91cf\u8bfb\u6570\u76f4\u63a5\u89e6\u53d1\u8bbe\u5907\u7ef4\u62a4\u3002', sourceKind: 'RUNBOOK', visibility: 'ROLE', sensitivity: 'RESTRICTED', grants: [{ principalType: 'ROLE', principalId: 'logistics_manager' }, { principalType: 'ROLE', principalId: 'dorm_manager' }, { principalType: 'ROLE', principalId: 'ai_ops_admin' }],
    content: ['\u80fd\u8017\u5f02\u5e38\u8bfb\u6570\u5fc5\u987b\u901a\u8fc7\u8d28\u91cf\u6807\u8bb0\u540e\u624d\u80fd\u53c2\u4e0e\u7ef4\u62a4\u5efa\u8bae\u3002\u8fde\u7eed\u4e09\u6761 valid \u8bfb\u6570\u662f\u6700\u4f4e\u8bc1\u636e\u95e8\u69db\u3002', '\u540e\u52e4\u8d1f\u8d23\u4eba\u8d1f\u8d23\u5ba1\u6838\u9884\u6d4b\u6027\u7ef4\u62a4\u5efa\u8bae\u3002\u5efa\u8bae\u5fc5\u987b\u5305\u542b\u8bbe\u5907\u3001\u8bfb\u6570\u6279\u6b21\u3001\u7f6e\u4fe1\u5ea6\u3001\u5efa\u8bae\u52a8\u4f5c\u548c\u622a\u6b62\u65f6\u95f4\u3002', '\u539f\u59cb\u8bfb\u6570\u4e0d\u5f97\u88ab\u6a21\u578b\u6539\u5199\uff0c\u4efb\u4f55\u5efa\u8bae\u90fd\u5fc5\u987b\u56de\u6307\u6570\u636e\u8bb0\u5f55 ID \u548c\u8d28\u91cf\u72b6\u6001\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'energy' },
  },
  {
    externalKey: 'showcase-lost-hygiene-guide', title: '\u5931\u7269\u8ba4\u9886\u4e0e\u536b\u751f\u6574\u6539\u8bc1\u636e\u6307\u5357', description: '\u7528\u4eba\u5de5\u6838\u9a8c\u4e0e\u590d\u6838\u8bc1\u636e\u4fdd\u62a4\u9690\u79c1\u548c\u6574\u6539\u8d28\u91cf\u3002', sourceKind: 'FAQ', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u5931\u7269\u8ba4\u9886\u5fc5\u987b\u7ecf\u8fc7\u4eba\u5de5\u7279\u5f81\u6838\u9a8c\u3002\u7cfb\u7edf\u53ef\u4ee5\u8bb0\u5f55\u7269\u54c1\u7c7b\u578b\u3001\u62fe\u53d6\u5730\u70b9\u548c\u65f6\u95f4\uff0c\u4f46\u4e0d\u5f97\u5411\u672a\u6838\u9a8c\u4eba\u5458\u663e\u793a\u5b8c\u6574\u9690\u79c1\u7279\u5f81\u3002', '\u536b\u751f\u6574\u6539\u4efb\u52a1\u5fc5\u987b\u5173\u8054\u539f\u59cb\u68c0\u67e5\u8bb0\u5f55\u3002\u6574\u6539\u5b8c\u6210\u540e\u9700\u4e0a\u4f20\u590d\u6838\u7167\u7247\u3001\u8bf4\u660e\u548c\u5b8c\u6210\u65f6\u95f4\u3002', '\u672a\u901a\u8fc7\u590d\u6838\u7684\u6574\u6539\u4efb\u52a1\u4e0d\u80fd\u8ba1\u5165\u5df2\u5b8c\u6210\u6307\u6807\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'lost-hygiene' },
  },
  {
    externalKey: 'showcase-notification-receipt-policy', title: '\u901a\u77e5\u53d1\u5e03\u3001\u9001\u8fbe\u4e0e\u786e\u8ba4\u56de\u6267\u89c4\u8303', description: '\u89e3\u51b3\u901a\u77e5\u53d1\u51fa\u540e\u65e0\u6cd5\u8bc1\u660e\u8c01\u771f\u6b63\u6536\u5230\u7684\u95ee\u9898\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u901a\u77e5\u53d1\u5e03\u540e\u5fc5\u987b\u8bb0\u5f55\u9001\u8fbe\u3001\u9605\u8bfb\u548c\u786e\u8ba4\u56de\u6267\u3002\u53d1\u5e03\u6210\u529f\u53ea\u8868\u793a\u4efb\u52a1\u5df2\u8fdb\u5165\u6295\u9012\u961f\u5217\uff0c\u4e0d\u4ee3\u8868\u6240\u6709\u4eba\u5df2\u6536\u5230\u3002', '\u8f85\u5bfc\u5458\u8d1f\u8d23\u5904\u7406\u672a\u786e\u8ba4\u901a\u77e5\u540d\u5355\u3002\u9ad8\u4f18\u5148\u7ea7\u901a\u77e5\u5728\u53d1\u5e03\u540e\u4e24\u5c0f\u65f6\u4ecd\u672a\u786e\u8ba4\u65f6\uff0c\u5e94\u8fdb\u5165\u4eba\u5de5\u8ddf\u8fdb\u3002', '\u767d\u6cfd\u53ef\u4ee5\u6c47\u603b\u9001\u8fbe\u7387\u548c\u672a\u786e\u8ba4\u6570\uff0c\u4f46\u4e0d\u5f97\u4f2a\u9020\u63a5\u6536\u56de\u6267\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'notification' },
  },
  {
    externalKey: 'showcase-classroom-policy', title: '\u6559\u5ba4\u9884\u7ea6\u51b2\u7a81\u4e0e\u5927\u578b\u6d3b\u52a8\u6279\u51c6\u89c4\u5219', description: '\u5c06\u8bfe\u8868\u3001\u5bb9\u91cf\u3001\u8bbe\u65bd\u548c\u4eba\u5de5\u6279\u51c6\u7eb3\u5165\u540c\u4e00\u9884\u89c8\u3002', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: ['\u6559\u5ba4\u9884\u7ea6\u5fc5\u987b\u540c\u65f6\u6821\u9a8c\u8bfe\u8868\u51b2\u7a81\u3001\u5bb9\u91cf\u548c\u8bbe\u65bd\u3002\u4efb\u4e00\u6761\u4ef6\u4e0d\u6ee1\u8db3\u65f6\uff0c\u7cfb\u7edf\u53ea\u80fd\u8fd4\u56de\u51b2\u7a81\u8bf4\u660e\u548c\u66ff\u4ee3\u6559\u5ba4\uff0c\u4e0d\u80fd\u5199\u5165\u9884\u7ea6\u3002', '\u5927\u578b\u6d3b\u52a8\u9884\u7ea6\u5fc5\u987b\u7ecf\u8fc7\u4eba\u5de5\u6279\u51c6\u3002\u6279\u51c6\u524d\u5fc5\u987b\u751f\u6210\u5305\u542b\u573a\u5730\u3001\u65f6\u95f4\u3001\u53c2\u4e0e\u4eba\u6570\u548c\u51b2\u7a81\u68c0\u67e5\u7ed3\u679c\u7684 Preview\u3002', '\u9884\u7ea6\u5b8c\u6210\u540e\u5fc5\u987b\u56de\u8bfb\u6559\u5ba4\u5360\u7528\u8bb0\u5f55\uff0c\u786e\u8ba4\u65f6\u6bb5\u3001\u7528\u9014\u548c\u7533\u8bf7\u4eba\u4e00\u81f4\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'classroom' },
  },
  {
    externalKey: 'showcase-ai-operations-runbook', title: '\u767d\u6cfd\u6a21\u578b\u7f51\u5173\u4e0e Agent \u8fd0\u884c\u6545\u969c\u5904\u7f6e\u624b\u518c', description: '\u4e3a AI \u8fd0\u7ef4\u7ba1\u7406\u5458\u63d0\u4f9b\u6a21\u578b\u3001\u68c0\u7d22\u3001\u4efb\u52a1\u4e0e\u5ba1\u8ba1\u6545\u969c\u5904\u7f6e\u8fb9\u754c\u3002', sourceKind: 'RUNBOOK', visibility: 'ROLE', sensitivity: 'CONFIDENTIAL', grants: [{ principalType: 'ROLE', principalId: 'ai_ops_admin' }],
    content: ['AI \u8fd0\u7ef4\u7ba1\u7406\u5458\u8d1f\u8d23\u76d1\u63a7\u6a21\u578b\u8c03\u7528\u5931\u8d25\u7387\u548c Token \u6d88\u8017\u3002\u8fd0\u7ef4\u9875\u53ea\u663e\u793a\u8c03\u7528\u6b21\u6570\u3001\u54c8\u5e0c\u3001\u6a21\u578b\u3001\u65f6\u5ef6\u548c\u7528\u91cf\uff0c\u4e0d\u663e\u793a API Key \u6216\u539f\u59cb\u63d0\u793a\u3002', '\u6a21\u578b\u901a\u9053\u5f02\u5e38\u65f6\u5fc5\u987b\u6267\u884c\u5931\u8d25\u5173\u95ed\u3002\u6a21\u578b\u4e0d\u53ef\u7528\u65f6\uff0c\u4e1a\u52a1\u5199\u5165\u4e0d\u5f97\u4f2a\u9020\u6210\u529f\uff0c\u767d\u6cfd\u5e94\u4fdd\u7559\u786e\u5b9a\u6027\u6838\u9a8c\u7ed3\u679c\u5e76\u62a5\u544a\u964d\u7ea7\u72b6\u6001\u3002', 'Agent \u4efb\u52a1\u957f\u65f6\u95f4\u65e0\u8fdb\u5c55\u65f6\uff0c\u5e94\u5148\u68c0\u67e5\u79df\u7ea6\u3001Outbox\u3001Skill Gateway \u548c\u4e1a\u52a1\u56de\u8bfb\uff0c\u4e0d\u5f97\u76f4\u63a5\u7ed5\u8fc7\u5ba1\u6279\u91cd\u653e\u5199\u64cd\u4f5c\u3002'].join('\n\n'), metadata: { showcaseVersion: SHOWCASE_VERSION, domain: 'ai-operations' },
  },
]

const relations = [
  ['showcase-event-venue-policy', '\u540e\u52e4\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u6838\u9a8c', '\u573a\u5730\u6863\u671f', 'RESOURCE', '\u540e\u52e4\u4e2d\u5fc3\u8d1f\u8d23\u6838\u9a8c\u573a\u5730\u6863\u671f\u548c\u8bbe\u65bd\u627f\u8f7d\u80fd\u529b\u3002'],
  ['showcase-event-venue-policy', '\u4fdd\u536b\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u5ba1\u6838', '\u5b89\u4fdd\u9884\u6848', 'DOCUMENT', '\u4fdd\u536b\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u4eba\u6d41\u4e0a\u9650\u548c\u5b89\u4fdd\u9884\u6848\u3002'],
  ['showcase-event-venue-policy', '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7', 'PROCESS', '\u5fc5\u987b\u63d0\u4ea4', '\u96e8\u5929\u5907\u7528\u65b9\u6848', 'DOCUMENT', '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u5fc5\u987b\u63d0\u4ea4\u96e8\u5929\u5907\u7528\u65b9\u6848\u3002'],
  ['showcase-student-status-guide', '\u5b66\u7c4d\u7ba1\u7406\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u5ba1\u6838', '\u4f11\u5b66\u7533\u8bf7', 'PROCESS', '\u5b66\u7c4d\u7ba1\u7406\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u4f11\u5b66\u7533\u8bf7\u3002'],
  ['showcase-student-status-guide', '\u5bbf\u7ba1\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u5b8c\u6210', '\u9000\u5bbf\u9a8c\u623f', 'PROCESS', '\u5bbf\u7ba1\u4e2d\u5fc3\u8d1f\u8d23\u5b8c\u6210\u9000\u5bbf\u9a8c\u623f\u3002'],
  ['showcase-student-status-guide', '\u8d22\u52a1\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u6838\u7b97', '\u4f4f\u5bbf\u8d39\u9000\u6b3e', 'PROCESS', '\u8d22\u52a1\u4e2d\u5fc3\u8d1f\u8d23\u6838\u7b97\u4f4f\u5bbf\u8d39\u9000\u6b3e\u3002'],
  ['showcase-repair-sla-policy', '\u4e00\u7ea7\u62a5\u4fee\u6545\u969c', 'EVENT', '\u9002\u7528', '\u5341\u4e94\u5206\u949f\u54cd\u5e94\u65f6\u9650', 'RULE', '\u4e00\u7ea7\u62a5\u4fee\u6545\u969c\u9002\u7528\u5341\u4e94\u5206\u949f\u54cd\u5e94\u65f6\u9650\u3002'],
  ['showcase-repair-sla-policy', '\u540e\u52e4\u8c03\u5ea6\u4e2d\u5fc3', 'ORGANIZATION', '\u8d1f\u8d23\u6267\u884c', '\u8de8\u533a\u57df\u6539\u6d3e', 'PROCESS', '\u5de5\u5355\u4e94\u5206\u949f\u5185\u65e0\u4eba\u63a5\u5355\u65f6\uff0c\u540e\u52e4\u8c03\u5ea6\u4e2d\u5fc3\u8d1f\u8d23\u6267\u884c\u8de8\u533a\u57df\u6539\u6d3e\u3002'],
  ['showcase-visitor-policy', '\u8bbf\u5ba2\u7533\u8bf7', 'PROCESS', '\u5fc5\u987b\u7ecf\u8fc7', '\u4eba\u5de5\u8eab\u4efd\u6838\u9a8c', 'CONTROL', '\u8bbf\u5ba2\u7533\u8bf7\u5fc5\u987b\u7ecf\u8fc7\u4eba\u5de5\u8eab\u4efd\u6838\u9a8c\u3002'],
  ['showcase-dorm-safety-runbook', '\u5bbf\u7ba1\u5458', 'ROLE', '\u8d1f\u8d23\u590d\u6838', '\u70df\u611f\u5f02\u5e38', 'EVENT', '\u5bbf\u7ba1\u5458\u8d1f\u8d23\u73b0\u573a\u590d\u6838\u70df\u611f\u5f02\u5e38\u3002'],
  ['showcase-energy-runbook', '\u540e\u52e4\u8d1f\u8d23\u4eba', 'ROLE', '\u8d1f\u8d23\u5ba1\u6838', '\u9884\u6d4b\u6027\u7ef4\u62a4\u5efa\u8bae', 'PROCESS', '\u540e\u52e4\u8d1f\u8d23\u4eba\u8d1f\u8d23\u5ba1\u6838\u9884\u6d4b\u6027\u7ef4\u62a4\u5efa\u8bae\u3002'],
  ['showcase-notification-receipt-policy', '\u8f85\u5bfc\u5458', 'ROLE', '\u8d1f\u8d23\u5904\u7406', '\u672a\u786e\u8ba4\u901a\u77e5\u540d\u5355', 'DATASET', '\u8f85\u5bfc\u5458\u8d1f\u8d23\u5904\u7406\u672a\u786e\u8ba4\u901a\u77e5\u540d\u5355\u3002'],
  ['showcase-classroom-policy', '\u6559\u5ba4\u9884\u7ea6', 'PROCESS', '\u5fc5\u987b\u6821\u9a8c', '\u8bfe\u8868\u51b2\u7a81', 'CONTROL', '\u6559\u5ba4\u9884\u7ea6\u5fc5\u987b\u540c\u65f6\u6821\u9a8c\u8bfe\u8868\u51b2\u7a81\u3001\u5bb9\u91cf\u548c\u8bbe\u65bd\u3002'],
  ['showcase-ai-operations-runbook', 'AI \u8fd0\u7ef4\u7ba1\u7406\u5458', 'ROLE', '\u8d1f\u8d23\u76d1\u63a7', '\u6a21\u578b\u8c03\u7528\u5931\u8d25\u7387', 'METRIC', 'AI \u8fd0\u7ef4\u7ba1\u7406\u5458\u8d1f\u8d23\u76d1\u63a7\u6a21\u578b\u8c03\u7528\u5931\u8d25\u7387\u548c Token \u6d88\u8017\u3002'],
  ['showcase-ai-operations-runbook', '\u6a21\u578b\u901a\u9053\u5f02\u5e38', 'EVENT', '\u5fc5\u987b\u6267\u884c', '\u5931\u8d25\u5173\u95ed', 'CONTROL', '\u6a21\u578b\u901a\u9053\u5f02\u5e38\u65f6\u5fc5\u987b\u6267\u884c\u5931\u8d25\u5173\u95ed\u3002'],
] as const

function normalizeName(value: string): string { return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '') }

async function main(): Promise<void> {
  const admin = getDevelopmentUser('admin')
  if (!admin) throw new Error('Development administrator is unavailable')
  const documentIds = new Map<string, string>()
  for (const document of documents) {
    const stored = await ingestKnowledgeDocument(admin, document)
    documentIds.set(document.externalKey!, stored.id)
  }
  const pool = getPostgresPool()
  let publishedRelations = 0
  for (const [externalKey, subjectName, subjectType, predicate, objectName, objectType, evidence] of relations) {
    const documentId = documentIds.get(externalKey)
    if (!documentId) throw new Error(`Missing seeded document ${externalKey}`)
    const chunkResult = await pool.query<{ id: string; content: string }>(
      `SELECT c.id,c.content FROM ai_knowledge_chunks c JOIN ai_knowledge_documents d ON d.id=c.document_id JOIN ai_knowledge_document_versions v ON v.id=c.version_id
       WHERE d.id=$1::uuid AND v.version_no=d.current_version AND v.status='PUBLISHED' AND position($2 in c.content)>0 LIMIT 1`,
      [documentId, evidence],
    )
    const chunk = chunkResult.rows[0]
    if (!chunk || !chunk.content.includes(subjectName) || !chunk.content.includes(objectName)) throw new Error(`Curated evidence is not present for ${externalKey}:${predicate}`)
    const entityIds: string[] = []
    for (const [name, type] of [[subjectName, subjectType], [objectName, objectType]]) {
      const entity = await pool.query<{ id: string }>(
        `INSERT INTO ai_knowledge_entities(school_id,canonical_name,normalized_name,entity_type,status,confidence,extraction_method,created_by,reviewed_by,reviewed_at,metadata)
         VALUES($1::uuid,$2,$3,$4,'PUBLISHED',1,'curated-showcase-v1',$5,$5,now(),$6::jsonb)
         ON CONFLICT(school_id,entity_type,normalized_name) DO UPDATE SET canonical_name=EXCLUDED.canonical_name,status='PUBLISHED',confidence=1,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now(),updated_at=now()
         RETURNING id`,
        [admin.school_id, name, normalizeName(name), type, admin.id, JSON.stringify({ showcaseVersion: SHOWCASE_VERSION, sourceDocumentId: documentId })],
      )
      entityIds.push(entity.rows[0].id)
      await pool.query(
        `INSERT INTO ai_knowledge_entity_mentions(school_id,chunk_id,entity_id,mention_text,confidence,extraction_method)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4,1,'curated-showcase-v1') ON CONFLICT DO NOTHING`,
        [admin.school_id, chunk.id, entity.rows[0].id, name],
      )
    }
    const relation = await pool.query(
      `INSERT INTO ai_knowledge_relations(school_id,subject_entity_id,predicate,object_entity_id,source_chunk_id,evidence_quote,status,confidence,extraction_method,created_by,reviewed_by,reviewed_at,metadata)
       VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,'PUBLISHED',1,'curated-showcase-v1',$7,$7,now(),$8::jsonb)
       ON CONFLICT(subject_entity_id,predicate,object_entity_id,source_chunk_id) DO UPDATE SET evidence_quote=EXCLUDED.evidence_quote,status='PUBLISHED',confidence=1,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now(),updated_at=now(),metadata=EXCLUDED.metadata
       RETURNING id`,
      [admin.school_id, entityIds[0], predicate, entityIds[1], chunk.id, evidence, admin.id, JSON.stringify({ showcaseVersion: SHOWCASE_VERSION, sourceDocumentId: documentId })],
    )
    publishedRelations += relation.rowCount ?? 0
  }
  const counts = await pool.query<{ documents: number; chunks: number; entities: number; relations: number }>(
    `SELECT
      (SELECT count(*)::int FROM ai_knowledge_documents WHERE school_id=$1::uuid AND metadata->>'showcaseVersion'=$2 AND status='PUBLISHED') AS documents,
      (SELECT count(*)::int FROM ai_knowledge_chunks c JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE c.school_id=$1::uuid AND d.metadata->>'showcaseVersion'=$2 AND c.version_id IN (SELECT id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version)) AS chunks,
      (SELECT count(*)::int FROM ai_knowledge_entities WHERE school_id=$1::uuid AND metadata->>'showcaseVersion'=$2 AND status='PUBLISHED') AS entities,
      (SELECT count(*)::int FROM ai_knowledge_relations WHERE school_id=$1::uuid AND metadata->>'showcaseVersion'=$2 AND status='PUBLISHED') AS relations`,
    [admin.school_id, SHOWCASE_VERSION],
  )
  const row = counts.rows[0]
  console.log(`SEEDED AI-5 knowledge ${SHOWCASE_VERSION}: documents=${row.documents} chunks=${row.chunks} entities=${row.entities} relations=${row.relations} upserts=${publishedRelations}`)
  await pool.end()
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
