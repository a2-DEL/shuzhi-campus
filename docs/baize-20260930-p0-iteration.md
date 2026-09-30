# 白泽 2026-09-30 P0 补全迭代：隔离验证与上线判定

本记录接续 `baize-20260930-delivery.md`；以下以 **PostgreSQL 15 隔离库 `qa_baize_20260930`** 的实测为准。不得在原始业务库运行测试种子、迁移和清理脚本。新增的 0016、0017 只创建白泽专用表，**没有改原有业务表、迁移、Skill 审批流程**。

## 改动文件与职责

| 文件 | 本轮变化 |
|---|---|
| `drizzle/0016_baize_tool_invocations.sql` | 五步只读工具调用审计；仅存参数哈希、状态、延迟、结果数，不存业务正文。 |
| `drizzle/0017_baize_memory_safety.sql` | 用户级实体索引、安全事件审计；按租户和用户隔离，不存原始敏感输入。 |
| `src/lib/ai/assistant/tools/executor.ts` | ReAct 观察与再规划、五次实际调用上限、最多两次修正/重试、失败关闭与阶段回调。 |
| `src/lib/ai/assistant/tools/registry.ts` | 严格参数 Schema、只读 PG 读模型、超千条走同源聚合接口。 |
| `src/app/api/ai/business-records/route.ts` | 11 域聚合在既有服务端 assignment scope 内完成，支持状态、时间、地点、本人筛选；前端 scope 不可信。 |
| `src/lib/ai/assistant/intent.ts`、`engine.ts` | 模型结构化多工具建议、本地复合查询拆解、来源追踪；无个人宿舍绑定时明确拒绝猜测。 |
| `src/lib/ai/assistant/memory.ts`、`src/app/api/ai/assistant/route.ts` | 20 条/约 70% 字符阈值摘要、跨会话已核验 ID 索引、每次查询重新鉴权；会话删除清理孤立实体索引；SSE 最终确认在消息落库后发送。 |
| `src/lib/ai/assistant/safety-policy.ts`、`guardrails.ts`、`safety-audit.ts`、`src/app/api/ai/conversations/safety/route.ts` | 输入本地政策拦截、输出基本脱敏与审计、本人安全事件查询。 |
| `src/lib/ai/model-gateway/stream.ts`、`service.ts`、`baize.ts` | DeepSeek 原生 SSE 增量解析；重试仅在尚未输出 token 时进行；每次模型调用仍经过统一网关并写审计。 |
| `src/lib/ai/assistant/client-stream.ts`、`src/app/ai-agents/conversation/page.tsx` | 碎片帧读取、过程状态、增量文本、失败中断提示及重试，最终消息以持久化结果覆盖暂态文本。 |
| `scripts/verify-baize-react-api.mjs`、`verify-baize-p0.ts`、`verify-baize-stream.ts`、`verify-baize-stream-api.mjs`、`verify-baize-long-dialog.mjs`、`verify-baize-live-stream.ts`、`package.json` | P0 专项、20 个越权参数场景、30 轮会话、8 并发模拟流、真实模型一次有审计的流式探针；新增 `pnpm` 脚本入口。 |

## 实测结果（2026-09-30）

- 静态：`pnpm run validate`、`pnpm exec next build`、自定义服务 `tsup` 打包通过；会话删除逻辑修改后已重新执行最终构建与全部隔离回归并通过。
- 原回归：生产构建 + 隔离库 `test:prelaunch-core` **42/42**、`test:ai-skills` **9/9**、`test:ai-conversation` **66/66**。
- 新增：`test:baize-react` **66**（含 20 个访客资源越权变体和 11 域统计核对）、`test:baize-p0` **25**、`test:baize-stream` **14**、`test:baize-stream-api` **13**、`test:baize-long-dialog` **36**；模型网关的 **8 并发流**在本地模拟器中审计一一对应。
- 真实服务：`test:baize-live-stream` 在隔离库中经真实 DeepSeek 返回 **147 个增量片段**，输出 254 字，最终网关审计成功；这是一条探针，不是 8 并发真实外呼，也不是中文安全/语义准确率证据。
- 长对话脚本证明 30 轮、60 条消息持久化，刷新可取回、100 字内摘要正常；**不证明**“第 5 轮实体的 95% 指代准确率”。
- 开发模式运行 `test:prelaunch-core` 曾因调试接口返回 403（开发策略）而失败；切换生产构建后返回 404，脚本 42 项通过。这是测试服务运行模式配置差异，不应误判成业务缺陷。

## 手动/脚本复现

1. 创建独立 `qa_*` PG15 数据库并设置 `DATABASE_URL`，另设 `TEST_ISOLATED_DATABASE=1`；确认 URL 指向隔离库后才执行 `pnpm run db:migrate`、种子脚本。绝不可引用真实校园 DB。
2. 生产构建验证：`pnpm run validate`、`pnpm exec next build`、`pnpm exec tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify`。用部署秘密注入 `AUTH_SECRET`（至少 32 字符），设置 `NODE_ENV=production`、`HOSTNAME=127.0.0.1`、`PORT=5000`，运行 `node dist/server.js`。以 `/api/health`=200 为准。
3. 回归脚本均在隔离库设 `TEST_BASE_URL=http://127.0.0.1:5000`，依次执行 `pnpm run test:prelaunch-core`、`test:ai-skills`、`test:ai-conversation`、`test:baize-react`、`test:baize-p0`、`test:baize-stream`、`test:baize-stream-api`、`test:baize-long-dialog`。脚本入口会拒绝非 `qa_*` 库。批量回归可把 QA 限流临时设 `BAIZE_USER_RPM=100`、`BAIZE_GLOBAL_QPS=200`；正式默认 10/分钟与 20/秒。
4. 可选且**会真实产生模型费用**：只有 `DEEPSEEK_API_KEY` 有效并经批准使用 QA 租户时，显式设置 `RUN_BAIZE_LIVE_MODEL_TEST=1` 后运行 `pnpm run test:baize-live-stream`；脚本结束恢复原租户网关路由，密钥只来自服务端秘密配置，不得打印/提交。
5. 手工：普通/学生账号分别打开 `/ai-agents/conversation`，新建会话、复合查询、刷新继续、删除、窄屏检查；无权访问访客详情应拒绝；聊天请求头 `Accept: text/event-stream` 时观察 `start`→`conversation`→可选 `phase`/`delta`→`done`，以返回 `messageId` 到 `baize_messages` 查询最终文字一致。单纯本地规则回复通常只有 `done`，不是模型逐字输出。

## 环境与调优

- 模型：`DEEPSEEK_API_KEY` 只在服务端设置；`DEEPSEEK_MODEL` 默认 `deepseek-chat`；`DEEPSEEK_BASE_URL` 只允许官方 HTTPS 域名；`DEEPSEEK_TIMEOUT_MS` 默认 12000，流式完整响应至少给 60 秒。`ai_runtime_settings` 需授权运维启用外部路由及 DeepSeek 供应商；预算开启时配成本费率环境变量，否则失败关闭。
- 流式：反向代理禁用缓冲（响应 `X-Accel-Buffering: no`），保留 `text/event-stream` 和连接；代理空闲超时应大于模型最长响应，验证取消、断网和客户端重试。服务端先保留末尾 48 字符并对累积前缀进行基本脱敏；`done` 只在落库后发出权威文本。**不能把此规则当完整输出内容审查**。
- 审计与数据保留：`baize_messages` 存完整对话内容；`ai_model_invocations` 只存哈希与用量，`baize_safety_events` 只存哈希及原因。生产需制定会话/审计保留期限、删除与访问审批；不要将聊天日志视为无敏感信息。
- 敏感词/策略模板：`src/lib/ai/assistant/safety-policy.ts` 内列有 `DANGEROUS`、`PROMPT_INJECTION`、`OFF_TOPIC` 示例模式。由学校合规负责人审定本地词库和误杀/漏拦测试后，方可扩展政策；不要仅凭正则声称 100% 拦截。

## 上线准入与剩余风险（**NO-GO**）

- 阶段 A：生产密钥、健康、匿名与调试口 404 验证；阶段 B：11 域 scope、20 种越权参数变体、旧写入口防护、9 个受控 Skill；已有隔离证据，仍需目标环境复验。
- 阶段 C：类型/ESLint/build、30 轮持久化、SSE 模拟断流及一条真实模型流已覆盖；**缺少手机/浏览器视觉、真实 8 并发端到端 HTTP SSE、模型故障下完整页面核验**。
- 阶段 D：**未满足**。没有人工审核过的校园敏感词与完整隐私政策，不能承诺敏感内容/注入拦截 100%；没有 30 轮跨主题第 5 轮实体指代 ≥95% 的真实模型评测；没有已核验的学生-宿舍房间绑定字段，不能编造“我的宿舍号”。批量统计有 scope 与 SQL 聚合，但未做生产量级性能/索引调优和容量保证。微信/短信/门禁、跨校远端、备份恢复、HA 仍不具备真实生产验收。
- **结论：仅供隔离环境和受控内部试点继续测试，不建议面向真实校园用户上线。P1 移动端/草稿预填及 RAG 提质必须在 P0 缺口被业务与安全责任人确认和验收后推进；P2 维持待办。**

