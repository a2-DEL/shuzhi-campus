# 上线前修复逐点回归方案（2026-09-29）

适用：Next.js 16.1.1 / Node 22 / PostgreSQL 15。此清单针对《项目上线前测试反馈报告》QA-01—QA-13。**仅对专用 `qa_*` 克隆库执行写入、清理和回归脚本**；原 `.env.local` 指向的源库不能直接用于测试。自动脚本开始前须有 `TEST_ISOLATED_DATABASE=1`、`DATABASE_URL` 的数据库名为 `qa_*`、`TEST_BASE_URL` 指向使用同一隔离库运行的生产构建服务。演示账户密码只可在隔离种子库使用；实际生产以真实安全配置为准。

## 可复制的本地流程（PowerShell，先检查并替换占位符）

```powershell
cd D:\高效管理\projects
# 前置：使用 pg_dump/pg_restore 或已有隔离克隆生成 qa_* 数据库；不要在源库执行脚本。
$env:DATABASE_URL = '<专用 qa_* PostgreSQL 连接地址>'
$env:TEST_ISOLATED_DATABASE = '1'
$env:TEST_BASE_URL = 'http://localhost:5000'
$env:AUTH_SECRET = '<从安全密钥服务临时注入的至少 32 字符密钥>'
$env:NODE_ENV = 'production'
node scripts/assert-isolated-test-environment.mjs
pnpm run validate
pnpm exec next build
pnpm exec tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
# 新开终端：重新提供同一组隔离库环境变量及 AUTH_SECRET，再启动（此终端保持运行）。
node dist/server.js
# 另一个测试终端：同样提供隔离库环境变量；不要用源数据库。
pnpm run test:prelaunch-core
pnpm run test:prelaunch-backend
pnpm run test:prelaunch-model-audit
pnpm run test:identity-api
pnpm run test:ai-runtime
pnpm run test:ai-skills
```

> 不要把任何真实 `AUTH_SECRET`/数据库 URL 写进文件或提交仓库。`test:prelaunch-core` 会新建并仅清理自身带随机标识的工单；`test:prelaunch-model-audit` 在隔离库临时覆盖模型路由参数并在 finally 恢复，HTTP 使用本地 mock（不会访问 DeepSeek）；其他种子测试可能重置演示记录，须先备份隔离库。`run-tests.ps1` 亦拒绝非 `qa_*` 数据库。

## 阶段 A：部署与范围安全（P0）

| 编号 | 人工 + 自动验收（请求用浏览器或 curl，身份 cookie 必须来自对应登录会话） | 合格判定 |
|---|---|---|
| QA-01 | 未设密钥/短密钥运行 `node dist/server.js`；另用 `next start` 无密钥访问 `/login`、`/api/health` 和 POST `/api/auth/login`；设置稳定长度≥32的密钥后重新登录、留存 cookie、同密钥重启，再换密钥重启 | 自定义入口退出；Next 页面 GET200、健康503/登录503 `AUTH_CONFIGURATION_ERROR`；有效密钥健康200/POST200并生成 cookie，同密钥 cookie 继续有效，换密钥旧 cookie 无效 |
| QA-02 | 后勤维修账号仅 assignment 组织 A；隔离库同时准备 A/B 工单；读 11 域分页及 `id` 详情，检查 page=999 的 total、`scope=global` 伪参数；按班级/建筑/本人权限补等价负例 | 只看授权行、分页/总计一致，不随前端伪造 scope 扩权；同租户未授权详情 403；无权限域 403；有权且存在的详情 200 |
| QA-03 | 在生产构建以匿名、学生、超级管理员请求 `/api/debug/db`；在开发环境重复三种会话 | 生产全 404，不暴露诊断字段；开发匿名/普通用户 403，超级管理员 200 |
| PG 生产选择 | 隔离库运行 `pnpm run test:prelaunch-backend`；测试时临时设置无效的旧 Supabase 凭据，然后关闭 `DATABASE_URL` / 强制内存模式 | 身份、任务、Skill 都优先选 PG；缺少 PG 时失败关闭，旧凭据/内存模式都不打开生产后门 |
| QA-05 | 对照 `docs/legacy-api-inventory.md` 遍历每个 GET/POST/PUT/PATCH/DELETE；匿名、普通越权、授权角色分别请求；另测 `/api/energy` 和宿舍巡检写口 | 未迁移路由分层返回 401/403/503 `LEGACY_FUNCTION_MIGRATING`，不因配置 Supabase 开放写入；已迁 PG 接口按 assignment/租户过滤，无 500 堆栈 |

## 阶段 B：学生报修及受控派单（P0）

| 编号 | 操作 | 合格判定 |
|---|---|---|
| QA-04 | 学生登录 `/student/repair/create` 填必填项、提交；刷新 `/student/repairs` 并打开新工单；维修账户查看本人组织的 repair 读模型；后勤对新工单执行既有 Skill「计划→批准→提交→回读」，学生刷新进度；匿名提交；附带前端伪造 `reporter_id`；机构存在多个受理组织时验证 | 成功201，`reporter_id` 必须为 session 用户，列表/详情/进度可见并正确派单；匿名401，伪造字段400，多组织不猜分流，409 明示需配置。派单 Skill 按原有业务规则回读，不通过旧直写接口。 |

## 阶段 C：页面契约与运行时（P1）

| 编号 | 操作 | 合格判定 |
|---|---|---|
| QA-06 | 按 `docs/prelaunch-page-api-map.md` 逐一在浏览器用正确角色访问 18 个原报错页面；学生消息列表→真实消息详情→已读刷新；学生个人资料、失物、值日、进度；抽查故意不存在 ID | 已迁 PG 数据正常、下游不再 500/错误路由404；未迁旧详情明确「功能迁移中」且不反复请求；没有空白崩溃/非预期 JS 异常 |
| QA-07 | 超管和普通用户访问 `/settings`、`/permissions`，点击保存/修改，刷新；普通用户 PUT `/api/permissions/roles` | 设置页清楚标注演示且输入和保存禁用；权限页展示实际 PG 角色/assignment 只读信息、不使用内存模拟；普通用户写入403，超管写入501 未开放，不假称保存 |
| QA-08 | 调用 `/api/ai/tasks` 的 `repair_dispatch` 分别传 `count:-1,0,11,1`，记任务总数；打开有效审批预览查看原参数与执行参数 | 非法参数400 `INVALID_PARAMETERS` + `fieldErrors['params.count']`、任务数不变；合法预览同时展示原输入和生效值，有差异显示高亮，禁止无提示改写 |
| QA-09 | 建长时间运行任务，订阅 `/api/ai/tasks/{id}/events`，触发 RUNNING/PARTIAL 等中间快照；再完成或拒绝，断网重连复测 | 中间态不会发送 `task.terminal` 或关闭流，真正 COMPLETED/FAILED/REJECTED/CANCELLED 才结束，重连可回读终态 |
| QA-10 | `pnpm run test:prelaunch-model-audit` 连续运行两次；模拟并发 8 个模型调用，检查 PG `ai_model_invocations` | 每轮返回 8 个不同 ID 对应 8 条 SUCCEEDED 审计记录，原模型配置恢复；失败分支回滚。外部 HTTP 本身**不能**纳入 PG 原子事务，不做强原子承诺 |
| QA-11 | 使用合法密钥/隔离库执行生产打包的 `node dist/server.js`（不设 COZE_PROJECT_ENV），读取启动日志，访问健康 | 输出 production、`NODE_ENV=production` 且健康200；COZE 为 PROD 但 NODE_ENV 未设时打印模式警告；`start.sh` 强制 production |

## 阶段 D：CI 可重复性与外部实证（P2）

| 编号 | 操作 | 合格判定 |
|---|---|---|
| QA-12 | 不传隔离库标志、将 `DATABASE_URL` 指向非 qa 库执行任一 verify/seed 脚本；隔离库新增与测试无关用户后跑 `test:identity-api`；换 `TEST_BASE_URL` 端口跑 extension 脚本 | 对非隔离库在测试逻辑开始前直接拒绝；身份断言不依赖库总用户数，仅删除自身生成的用户；MCP 地址动态按测试入口生成 |
| QA-13 | 未启用微信登录时访问 `/login`，请求 `/api/auth/wechat/qrcode` 和 `/status`；查 README 能力矩阵 | 登录页无微信按钮，两个接口都是503且有明确尚未接入消息；短信/邮箱/微信通知、门禁硬件、真实远端联邦、WAL 恢复和多实例 HA 标注未完成 |
| 综合 | 在隔离 PG 重跑 9 Skill 计划/批准/提交/回读，负例含越权/过期/幂等/局部失败；真实校园按本校 SLO 测 8h 持续运行、备份恢复、外部渠道/硬件端到端 | 本机读性能只是初步结果；未得到真实服务协议/设备回执/恢复演练前，D **不通过**，不能把本地测试视作生产准入 |

## 脚本失败的诊断顺序

先检查隔离库授权种子和数据库名、测试 URL/端口、服务的生产模式与密钥是否一致、模型路由/外部 `DEEPSEEK_API_KEY`、MCP 的 HTTPS 证书/SSRF 规则。知识 RAG 强制真实模型回答脚本在缺失外部模型密钥时失败是预期的**前置条件不足**；非预期 API500、同租户跨 scope 读取、匿名写成功、账本丢失则为业务缺陷。参见 README 与原始逐项测试附录。
