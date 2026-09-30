# 上线前修复文件逐项清单（2026-09-29）

以本轮被修改/新增且位于项目工程目录的文件为边界（不列 .next、dist、.local、node_modules 等构建及运行产物）。**未删除原文件，未改数据库迁移脚本/表结构；原 Supabase 路由保留并禁用旧链路。**

| 文件（相对项目根目录） | 改动要点 |
|---|---|
| `docs/legacy-api-inventory.md` | 逐路由列出 PG 迁移、旧 Supabase 鉴权后 503 和只读兼容范围 |
| `docs/prelaunch-page-api-map.md` | 18 个原异常页面的页面—API 对照、迁移状态和用户提示 |
| `docs/prelaunch-regression-plan.md` | QA-01—QA-13 人工及脚本复测、隔离前提、A—D 门槛 |
| `package.json` | 增加隔离 PG 上线前核心/模型并发/生产后端选择回归入口；构建 lint 限定源码与脚本，排除视频生成素材 |
| `README.md` | 上线前能力矩阵、外部能力边界、安全部署、隔离测试与 A—D 门槛 |
| `scripts/assert-isolated-test-environment.mjs` | 统一校验 qa_* 数据库和 TEST_ISOLATED_DATABASE 前置条件 |
| `scripts/dbcheck-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/deepseek-probe-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/invocations-check-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/list-users-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/login-smoke-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/page-smoke-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/rag-diagnose-tmp.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/run-tests.ps1` | 移除内嵌数据库口令，拒绝源库并正确传递 CI 退出码 |
| `scripts/school-check-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-ai-integration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-collaboration-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-enterprise-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-evolution-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-extension-showcase.ts` | MCP 地址读取 TEST_BASE_URL 并加隔离守卫 |
| `scripts/seed-knowledge-showcase.ts` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/seed-twin-federation-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-users.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/seed-workflow-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/settings-check-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/settings-update-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/start.sh` | 强制生产模式及生产密钥长度启动断言 |
| `scripts/twin-diagnose-tmp.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-business-adapters-postgres.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-business-adapters.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-collaboration-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-collaboration-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-evolution-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-evolution-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-extension-api.mjs` | MCP 测试地址读取 TEST_BASE_URL 并加隔离守卫 |
| `scripts/verify-ai-extension-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-graph-workbench.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-knowledge-api.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-ai-knowledge-graph.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-ai-knowledge-migration.ts` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-ai-knowledge-retrieval.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-ai-knowledge-showcase.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-ai-live-events.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-operations-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-platform-browser.mjs` | 浏览器缓存使用唯一 .local 测试目录并加测试守卫 |
| `scripts/verify-ai-platform-integration.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-repair-triad.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-runtime-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-runtime-recovery.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-runtime-repository.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-runtime.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-scenarios.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-skill-contracts.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-skill-gateway.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-skill-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-twin-federation-api.mjs` | 联邦运行目录限定在 .local 隔离位置并加测试守卫 |
| `scripts/verify-ai-twin-federation-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-vector-workbench.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-workflow-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-ai-workflow-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-baize-assistant-api.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-baize-rag.mjs` | 隔离环境守卫，并注释需外部模型密钥的 RAG 前置条件（如适用） |
| `scripts/verify-deepseek-live.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-enterprise-pages.mjs` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-enterprise-showcase.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-identity-api.mjs` | 唯一 ID 测试用户断言，取消固定用户总数依赖及大范围清理 |
| `scripts/verify-identity-authorization.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-identity-migration.ts` | 测试/造数入口增加隔离 PG 守卫，拒绝正式库 |
| `scripts/verify-prelaunch-backend-selection.ts` | 模拟同时配置旧凭据与 PG：生产身份、任务与 Skill 只选 PG；无 PG 失败关闭 |
| `scripts/verify-prelaunch-core.mjs` | 11 域授权、维修 E2E、旧接口、参数及微信的隔离 PG HTTP 回归 |
| `scripts/verify-prelaunch-model-concurrency.ts` | 模型并发 8 调用/8 审计记录和配置恢复的模拟验证 |
| `src/app/api/ai/assistant/route.ts` | 任务参数非法 400 字段级反馈及保留原始输入预览 |
| `src/app/api/ai/business-records/route.ts` | 11 域共用 assignment SQL scope 过滤列表、分页总计与单项详情 |
| `src/app/api/ai/system/route.ts` | 生产业务就绪态只认 PG，优先报告 PG 运行后端；遗留 Supabase 仅开发时可见 |
| `src/app/api/ai/governance/route.ts` | PG 优先，生产禁用 Supabase 回退 |
| `src/app/api/ai/tasks/[id]/events/route.ts` | 仅终态发送 task.terminal，非终态保持续传 |
| `src/app/api/ai/tasks/execute/route.ts` | 任务参数非法 400 字段级反馈及保留原始输入预览 |
| `src/app/api/ai/tasks/route.ts` | 任务参数非法 400 字段级反馈及保留原始输入预览 |
| `src/app/api/auth/login/route.ts` | POST 前置密钥校验，非法配置返回 503 |
| `src/app/api/auth/wechat/qrcode/route.ts` | 未接入微信渠道统一返回明确 503 消息 |
| `src/app/api/auth/wechat/status/route.ts` | 未接入微信渠道统一返回明确 503 消息 |
| `src/app/api/classes/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/classrooms/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/classrooms/bookings/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/classrooms/bookings/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/classrooms/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/courses/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/courses/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/dashboard/stats/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/debug/db/route.ts` | 生产全部 404，开发限超级管理员 |
| `src/app/api/dormitories/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/dormitories/inspections/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/dormitories/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/duties/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/duties/records/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/duties/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/energy/route.ts` | 旧能耗 GET 复用受 assignment 约束的 PG 读模型 |
| `src/app/api/health/route.ts` | 校验密钥与 PG 的 readiness 200/503 |
| `src/app/api/init/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/lost-found/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/lost-found/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/materials/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/materials/requests/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/materials/requests/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/materials/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/mock-data/generate/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/notifications/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/notifications/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/repairs/[id]/route.ts` | 维修创建/列表/进度/详情切换隔离 PG 与租户/资源范围鉴权，旧写入口禁用 |
| `src/app/api/repairs/route.ts` | 维修创建/列表/进度/详情切换隔离 PG 与租户/资源范围鉴权，旧写入口禁用 |
| `src/app/api/repairs/stats/route.ts` | 维修创建/列表/进度/详情切换隔离 PG 与租户/资源范围鉴权，旧写入口禁用 |
| `src/app/api/schedules/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/student/duty-service/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/lost-found/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/messages/[id]/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/messages/read/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/messages/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/profile/route.ts` | 学生资料、值日、失物、投递消息/已读切换 PG 会话限定只读或受控已读写入 |
| `src/app/api/student/repair-progress/route.ts` | 维修创建/列表/进度/详情切换隔离 PG 与租户/资源范围鉴权，旧写入口禁用 |
| `src/app/api/visitors/[id]/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/api/visitors/route.ts` | 遗留 Supabase 入口添加会话、租户、权限前置守卫；按清单返回安全 503，保留原代码 |
| `src/app/classrooms/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/dormitories/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/duties/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/duties/records/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/login/page.tsx` | 渠道未启用时隐藏微信登录入口 |
| `src/app/lost-and-found/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/materials/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/messages/[id]/page.tsx` | 消息列表、详情和已读接入本人 PG 投递数据 |
| `src/app/messages/page.tsx` | 消息列表、详情和已读接入本人 PG 投递数据 |
| `src/app/notifications/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/permissions/[id]/page.tsx` | 权限总览读取真实策略且只读，旧详情展示迁移提示 |
| `src/app/permissions/page.tsx` | 权限总览读取真实策略且只读，旧详情展示迁移提示 |
| `src/app/profile/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/settings/page.tsx` | 演示状态明确提示并禁用所有虚假保存操作 |
| `src/app/student/dashboard/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/student/duties/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/student/lost-found/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/student/profile/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/student/repair/create/page.tsx` | 表单不再传 reporter_id；成功跳转、失败友好提示 |
| `src/app/student/repairs/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/app/visitors/[id]/page.tsx` | 修正页面—API 路径/学生 PG 请求，并为未迁详情显示功能迁移中提示 |
| `src/components/ai/product/task-detail.tsx` | 审批预览并列展示原输入与实际执行参数及差异提示 |
| `src/lib/identity/repository.ts` | 生产身份库优先 PG，旧 Supabase 仅开发兼容，无 PG 拒绝服务 |
| `src/lib/ai/runtime/repository.ts` | 生产任务库优先 PG，旧 Supabase 仅开发兼容，无 PG 拒绝服务 |
| `src/lib/ai/skills/port.ts` | 生产 Skill Port 优先 PG，旧 Supabase 与测试 Port 不能覆盖生产 |
| `src/lib/ai/model-gateway/service.ts` | 模型审计初始化用同一 PoolClient 事务，失败回滚并释放 |
| `src/lib/ai/product-types.ts` | 计划输入与有效预览参数的 typed 传递/显示 |
| `src/lib/ai/product-view.ts` | 计划输入与有效预览参数的 typed 传递/显示 |
| `src/lib/ai/runtime/orchestrator.ts` | 严格参数校验，移除静默 count 改写 |
| `src/lib/ai/runtime/planner.ts` | 严格参数校验，移除静默 count 改写 |
| `src/lib/ai/runtime/task-terminal.ts` | 显式定义真正的 SSE 终态集合 |
| `src/lib/auth-session.ts` | 生产密钥长度约束及一致运行模式判定 |
| `src/lib/authorization-resource-scope.ts` | 11 域使用统一 assignment SQL scope 过滤工具 |
| `src/lib/authorization.ts` | 提供有效且具权限的 assignment 筛选助手 |
| `src/lib/legacy-api-client.ts` | 前端对迁移中 503 提供友好标准提示 |
| `src/lib/legacy-api.ts` | 旧写口服务端身份/租户/角色校验并 503 禁用 |
| `src/lib/repairs/reader.ts` | PG 工单详情资源范围限定的统一读取 |
| `src/lib/repairs/service.ts` | 学生 PG 工单领域创建、唯一受理组织和会话 reporter 绑定 |
| `src/server.ts` | 生产启动先验签名密钥、模式识别和日志 |

共 161 个工程文件（含本索引外的 README、package.json，新增文档另见下方）。每个脚本均为独立文件而非“批量删除”。新增文档：`docs/prelaunch-file-manifest.md`（本表）与 `docs/prelaunch-delivery-report.md`（交付报告），实际验收依 `docs/prelaunch-regression-plan.md`。
