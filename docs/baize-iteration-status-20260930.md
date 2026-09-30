# 白泽迭代状态与上线检查模板（2026-09-30，隔离 PG）

> 仅记录 `qa_baize_20260930` 的实际验证；不得将隔离测试结果解释为真实校园生产就绪。本文件不包含密钥、真实人员信息或未经批准的学校制度。

## 1. 部署与健康判定

| 状态 | 通过条件 | 当前隔离测试 |
| --- | --- | --- |
| `executionReady` | AUTH_SECRET ≥ 32、PG 连接/迁移、租户身份与 9 个 Skill 合同可用 | 通过 |
| `modelReady` | DeepSeek 服务端密钥、可信 HTTPS 基础地址、租户路由、**本进程最近 30 分钟的真实 challenge 探测成功**，且熔断未开启 | 无密钥=false；真实密钥+诊断=true |
| `knowledgeReady` | 同租户至少一篇位于 ACTIVE 知识库的已发布文档 | false（0 篇），不可虚称知识咨询可答 |
| `/api/health` | PG 与认证不可用返回 503；部分模块可用返回 200 `partial` 并列出模块；全就绪返回 200 `ready` | 无密钥时 200 `partial` |

`/api/health` 是服务级探针，不提供租户授权状态；登录后以 `/api/ai/system` 为准。`modelConfigured=true` 仅代表格式与配置初检，不代表 `modelReady=true`。探测通过 `POST /api/ai/operations`（`{"action":"diagnose"}`，需运维角色），不应通过无审计的直连请求证明可用。重启后需重新探测。

### 必填/可选环境变量

- `NODE_ENV=production`；`DATABASE_URL` 指向 **目标环境** PG（回归只允许独立 `qa_*` 库）。
- `AUTH_SECRET` 使用部署密钥管理器注入，长度至少 32，禁止硬编码或提交。
- `DEEPSEEK_API_KEY` 仅服务端注入；不用时留空，明确运行基础规则模式。`DEEPSEEK_BASE_URL=https://api.deepseek.com`，`DEEPSEEK_MODEL=deepseek-chat`，`DEEPSEEK_TIMEOUT_MS` 控制超时。不得前端直连。
- `BAIZE_USER_RPM`/`BAIZE_GLOBAL_QPS` 为对话限流，`BAIZE_MODEL_USER_QPM`/`BAIZE_MODEL_GLOBAL_QPS` 为模型调用限流；生产推荐先使用 `.env.example` 默认值，调高须风险评估。
- 如果租户配置每日模型费用预算，还需设置 `DEEPSEEK_INPUT_COST_PER_MILLION_CENTS`、`DEEPSEEK_OUTPUT_COST_PER_MILLION_CENTS`，否则网关拒绝计费调用。
- `TEST_ISOLATED_DATABASE=1` 和 `TEST_BASE_URL` **只用于隔离库脚本**；所有脚本启动时检查库名 `qa_*`，严禁对真实生产 DB 执行回归/清理。

### 可复验命令（本机隔离库）

先通过密钥管理器设置 `DATABASE_URL`、`AUTH_SECRET`，启动 `NODE_ENV=production` 的 `node dist/server.js`；再设置 `TEST_ISOLATED_DATABASE=1` 和 `TEST_BASE_URL=http://127.0.0.1:5000`：

```sh
pnpm run db:migrate
pnpm run validate
pnpm next build
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
pnpm run test:baize-slots
pnpm run test:baize-slots-api
pnpm run test:baize-guard
pnpm run test:baize-safety
pnpm run test:prelaunch-core
pnpm run test:ai-conversation
pnpm run test:baize-react
pnpm run test:ai-skills
```

`test:baize-live-30` 必须使用隔离 PG、有效 DeepSeek 密钥、可计费网络和单独端口；脚本会发起真实外部调用。先运维诊断探测，再执行 30 轮，不可把本地 mock 当作真实联调。测试会写入隔离库会话与模型审计；只允许在可控预算下运行。

## 2. 当前阶段证据与停止线

- **P0-1**：22 个本地槽位样例/64 断言；18 条自然语言问句和受权限 PG 统计零误差对照、4 条歧义澄清/共 174 断言。新增迁移 `0018_baize_query_audit.sql` 只扩展白泽工具审计：原话存在用户隔离消息表，审计账本保存关联 ID/哈希、解析/生效参数、服务端 assignment scope 和返回条数。
- **P0-2**：隔离 mock 的探测/限流/连续 10 次失败熔断测试；真实模型 30 轮，49 次成功调用/20820 token 有账本，4 条业务比对一致。模型认证失败、余额不足、无知识资料不能被这些测试自动视为通过。
- 既有 42 项核心、66 项对话、66 项 ReAct、9 个 Skill 契约通过；TypeScript、ESLint、Next.js 生产构建通过。
- **P1-5 局部**：输入拒绝/正常输入/学号、手机、证件号、邮箱输出脱敏共 24 断言；会话抽屉、气泡和全局窄屏导航样式已修改；390px 浏览器视口的全局导航独立关闭、会话抽屉开合与页面无横向溢出已检查，真机视觉与 8 并发 SSE 尚需验收。

## 3. P1/P2 仍需确认，禁止伪造完成

| 模块 | 当前阻碍 / 【需要确认】 | 上线判定 |
| --- | --- | --- |
| P1-1 校园知识库 | 没有经过学校责任人签核的 10 篇制度原文、版本与角色授权。项目方案书、竞赛材料不能当学校正式制度发布；目前 0 篇。需提供原文、发布人、发布日期、适用租户/角色。 | 禁止发布虚构制度；RAG 无证据必须拒答。 |
| P1-2 工作流 | 没有物资领用/场地预约的正式表单字段、审批节点、发起/审批角色。不能把示意流程当真实批准链。 | 先确认定义，再走原工作流审批。 |
| P1-3 MCP | 当前无可信 HTTPS MCP 服务及工具授权清单。生产 HTTP/内网地址必须继续拦截。 | 未注册且未联调前 `mcpReady=false`。 |
| P1-4 Outbox | 原表状态约束是 `PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD_LETTER`，**不允许写入 `COMPLETED`**；`PUBLISHED` 仅代表事件发布，不等于短信/邮件/站内用户已收到。需明确事件契约、真正的投递目标、幂等 ACK 与消息渠道；不能修改原始业务表迁移。 | 无真实消费者与投递 ACK 前，禁止宣称交付闭环。仅在隔离库按缺失任务关联条件精确清理 7 条孤儿 PENDING 事件，仍有 4 条有效任务事件待消费；正式库未触碰。 |
| P1-5 / P2 | 移动端真机视觉、8 并发真实外部 SSE、20 种人工渗透、8 小时稳定性、第三方微信/短信/硬件尚未验证。 | 不作为生产可用能力宣传。 |

### 日常状态记录模板

| 日期/环境/租户 | executionReady | modelReady + 探测时间 | knowledgeReady + 已发布数 | MCP 活跃服务/工具 | outbox 待处理/失败/死信/真实送达 | 角色越权回归 | 30 轮结果 | 审批人 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

**上线结论：** 当前仅能对已验证的隔离库 PG 核心查询、受控 Skill 预览与模型探测作“局部通过”判定；知识库制度、工作流/MCP、异步真实投递、校园生产环境安全合规仍未完成，不应宣布智能体整体生产上线。




