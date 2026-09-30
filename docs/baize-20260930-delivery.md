# 历史阶段基线；本日后续 P0 迭代及现行准入结论请见 `baize-20260930-p0-iteration.md`

# 白泽智能体增强阶段交付与验收记录（2026-09-30）

## 实际交付与架构边界

- 新增迁移 `drizzle/0015_baize_conversations.sql`，只新增会话、消息、实体索引、限流窗口、熔断状态表，不修改既有业务表或原有迁移文件。所有会话/消息读取和变更带 `school_id` 与 `user_id`，跨用户会话统一 404；不会持久化外部模型原始 Prompt/回复到模型审计表。**注意聊天内容本身按产品要求持久化**，正式部署必须另行制定脱敏、保留期限、删除和访问审计政策。
- `src/lib/ai/assistant/memory.ts` 提供所有者限定的 CRUD、消息追加事务和已核验实体索引；`src/app/api/ai/conversations/route.ts`、`[id]/route.ts`、`usage/route.ts` 提供用户自己的会话/消息/按日用量 API。
- `src/lib/ai/assistant/tools/registry.ts` 将受控只读查询路由到现有 PG 读模型 GET，模型和客户端均不能传 scope；服务端校验权限，分页最多累计 1000 条，超过直接提示缩小范围，不能以不完整页面冒充精确总数。此上限不是生产数据规模保证。
- `src/lib/ai/assistant/intent.ts` 在租户启用外部模型路由且注入密钥时经统一网关做结构化意图/槽位建议，服务端 Zod 和权限再次验证；网关不可用时使用本地规则。不能把纯规则兜底误判为真实 DeepSeek 功能通过。
- `src/lib/ai/assistant/guardrails.ts` PG 原子限流、租户熔断与基础内容拦截。基础正则不是完整内容安全分类器，不能作为校园生产合规审核替代。
- `src/lib/ai/assistant/engine.ts` 将原助手直接业务聚合 SQL 改为 scoped 读模型，包含格式/状态/地点/上周本月筛选、分组、受控报修申请草稿；显式 Skill 调度保持原审批路径。模型不会直接执行写入。
- `src/lib/ai/model-gateway/service.ts` 统一网关最多 3 次指数退避；调用元数据写入会话 ID/工具次数，异常仍在现有审计账本留痕。`src/lib/ai/model-gateway/baize.ts` 注入角色/租户及安全边界；有模型正文回复时消息分别记录 prompt/completion token，单独的意图调用用量以模型审计账本为准。
- `src/server.ts` 与 `scripts/start.sh` 明确绑定地址：本地 QA 仅回环接口，部署脚本通过环境变量绑定受控入口。`src/app/ai-agents/conversation/page.tsx` 新增历史会话、新建/重命名/删除、回车发送、Shift+回车换行、复制、失败重试、报修草稿跳转；**当前仍非模型 token 原生流式响应**。
- `scripts/verify-baize-conversation-api.mjs` 与 `scripts/verify-baize-model-guard.ts` 用独立 `qa_*` 数据库验证；`.env.example` 给出限流参数。

## 环境与手工复现

1. 仅创建新的 `qa_*` PostgreSQL 15 数据库，设置 `DATABASE_URL` 指向它、`TEST_ISOLATED_DATABASE=1`；**不得运行迁移/种子/回归脚本到 `.env.local` 原数据库**。迁移 `pnpm run db:migrate`，种子 `pnpm run db:seed-ai-integration`。
2. 启动隔离服务：设置稳定的 `AUTH_SECRET`（随机至少 32 字符）、`NODE_ENV=production`、`PORT=5000`、`DATABASE_URL` 为上述隔离库，先 `pnpm run validate`、`pnpm exec next build`、`pnpm exec tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify`，再 `node dist/server.js`。隔离 QA 设置 `HOSTNAME=127.0.0.1` 仅绑定本机；正式 `scripts/start.sh` 显式默认 `0.0.0.0` 以便由受控入口代理访问。生产真环境不启用演示账号。
3. 本地对话回归建议测试服务设置 `BAIZE_USER_RPM=100`、`BAIZE_GLOBAL_QPS=200`，因为脚本单账号连续调用超过生产默认 10 次/分。另运行 `pnpm run test:baize-guard` 复测默认 10 次/分与 10 连败/五分钟熔断，脚本用本地模拟 fetch，**不外呼模型**。
4. `TEST_BASE_URL=http://localhost:5000 pnpm run test:ai-conversation`（Windows PowerShell 需用 `$env:TEST_BASE_URL=...`）；`pnpm run test:prelaunch-core`、`pnpm run test:ai-skills`。浏览器以学生与后勤账号分别登录：新会话→报修只读查询→刷新继续→跨用户 ID 访问 404→报修草稿不写库→显式 Skill 预览审批。
5. 生产若使用真实 DeepSeek：服务端秘密管理注入 `DEEPSEEK_API_KEY`，租户 `ai_runtime_settings` 须由授权运维配置为 `external_preferred`/`hybrid_fail_closed` 和 `primary_provider='deepseek'`；设置费用预算和单日账本/告警策略。前端绝不读取密钥。真实调用与输出合规尚需单独验收，不用模拟调用结果替代。

## 当前上线风险与准入判断

- **NO-GO**：原生模型流、模型跨主题准确率与模糊实体召回尚未充分验证；单用户历史消息虽持久化，但 20 条以前的自然语言语义仅保留经过核验的资源索引，缺乏生产级自动总结；复杂任务只支持少量只读多域建议，尚非完整 ReAct 循环；个人宿舍/班级读取需确认真实 PG 领域字段/关联后实现，不编造；微信/短信/硬件/跨校等仍未接入。
- 读模型最多 1000 条内存分页，超限失败关闭；不能当作大规模统计服务。用户/全局限流及熔断依赖 PG，同一数据库故障时整体失败关闭。
- 阶段 A：密钥、租户、调试口/登录/健康/迁移就绪；阶段 B：11 域 scoped 查询、匿名/跨组织/跨用户拒绝、草稿不写业务库、原 Skill 审批；阶段 C：历史刷新与移动端、模型故障友好降级、页面/API 契约；阶段 D：真实模型额度与审计、内容安全、压力/并发、可观测性、外部渠道/硬件。A/B/C/D 没有全部有证据通过之前不应宣布生产上线。

## 2026-09-30 隔离复测结果

| 检查项 | 实际结果 |
|---|---|
| 独立本机 PostgreSQL 15 集群 / 全量迁移 / 测试种子 | `qa_baize_20260930`，0015 在内全部迁移成功；14 个演示身份及 11 域种子，另补一条跨组织权限夹具；未连接原始数据库。 |
| 会话与权限 API | `pnpm run test:ai-conversation`：66 个断言在生产构建的隔离服务下全部通过，含新建、查询、继续、重命名、删除、跨用户 404、>20 轮、草稿不直接写入、表格及范围校验。 |
| 原有核心业务 | `pnpm run test:prelaunch-core`：42 个断言通过，含匿名/跨组织访问、11 域读模型、学生报修与旧入口保护。 |
| 受控 Skill | `pnpm run test:ai-skills`：9 个 Skill 契约通过。 |
| 模拟模型保护 | `pnpm run test:baize-guard`：429 重试、八并发一一对应审计、会话关联、限流、熔断、内容阻断、模拟意图分类通过。 |
| 真实 DeepSeek | 统一网关 live probe 成功：返回 `deepseek-flash`，审计记录含 token；`pnpm run test:baize-live-intent` 五条真实意图/指代提示全部通过。5 条不能代表生产准确率。 |
| 静态检查和生产构建 | `pnpm run validate`、Next.js 生产构建及自定义服务打包均通过。 |
| 浏览器视觉/移动端 | 当前 Codex 浏览器安全策略拒绝本地 HTTP 页面的访问，未执行真实设备或移动端视觉验收，不能视为通过。 |

**注：测试服务的密钥为每次进程随机生成，单用户限制临时设为 100/分钟以容纳单账号密集回归；生产默认应为 10/分钟。测试会产生会话及模型审计记录，仅在隔离库中进行。**
