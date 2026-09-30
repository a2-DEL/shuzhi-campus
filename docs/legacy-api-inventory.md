# 旧接口迁移清单（2026-09-29）

所有原 Supabase 路由文件均保留并在每个 HTTP 方法入口执行会话/租户/角色权限守卫，默认返回 JSON `LEGACY_FUNCTION_MIGRATING` / HTTP 503；匿名 401，越权角色 403。**旧写逻辑不能绕过新的 PG Skill 领域规则**。不应将 503 误解为成功业务接口。

## 已迁移到 PG（允许的只读兼容 / 特殊写口）

- `/api/repairs` GET（带 scope 的 PG 列表）与 POST（仅会话身份创建报修；独立于受控派单 Skill）；`/api/repairs/[id]` GET 与 `/api/repairs/stats` GET（同范围的 PG 只读兼容）。`/api/repairs/[id]` 的 PATCH/PUT/DELETE 仍禁用。
- `/api/student/repair-progress`、`/api/student/profile`、`/api/student/duty-service`、`/api/student/lost-found` GET、`/api/student/messages` GET、`/api/student/messages/[id]` GET、`/api/student/messages/read` POST（仅当前用户已投递消息的已读状态）。学生失物发布 POST 仍禁用。
- `/api/energy` GET：复用具备 energy:view 授权与 assignment scope 的新 PG 能耗读模型，不再使用旧 Supabase 回退。
- `/api/ai/business-records?domain=repair|notification|classroom|lost_found|hygiene|dormitory|dorm_safety|visitor|energy|material|duty`：11 域 PG 只读模型，不走 Supabase；所有列表、分页、统计及 `id` 详情共享 assignment scope。
- `/api/users`、`/api/permissions/roles`、`/api/permissions/assignments` 等新身份/策略接口独立维护，**不是**以下旧 Supabase CRUD 的兼容写口。

## 已隔离旧 Supabase CRUD（按模块分类）

| 路由 | 方法 | 当前状态 |
|---|---|---|
| `/api/classes` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/classrooms` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/classrooms/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/classrooms/bookings` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/classrooms/bookings/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/courses` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/courses/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/dashboard/stats` | `GET` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/dormitories/inspections` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/dormitories` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/dormitories/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/duties` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/duties/[id]` | `PUT,GET,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/duties/records` | `GET` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/init` | `POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/lost-found` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/lost-found/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/materials` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/materials/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/materials/requests` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/materials/requests/[id]` | `PUT,GET` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/mock-data/generate` | `POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/notifications` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/notifications/[id]` | `GET,POST,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/repairs/[id]` | `PATCH,PUT,GET,DELETE` | GET 已迁 PG 范围详情；PATCH/PUT/DELETE 鉴权后 503，旧代码保留 |
| `/api/schedules` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/student/duty-service` | `GET` | GET 已迁 PG 会话范围读取；原 Supabase 路径保留守卫 |
| `/api/student/lost-found` | `GET,POST` | GET 已迁 PG 会话范围读取；原 Supabase 路径保留守卫，POST 禁用 503 |
| `/api/student/messages` | `GET` | GET 已迁 PG 会话范围读取；原 Supabase 路径保留守卫 |
| `/api/student/profile` | `GET` | GET 已迁 PG 会话范围读取；原 Supabase 路径保留守卫 |
| `/api/visitors` | `GET,POST` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |
| `/api/visitors/[id]` | `GET,PUT,DELETE` | 会话+租户+角色鉴权后 503；原代码保留，禁止直接执行 |


兼容范围仅限上文明确迁移的 PG 只读接口；尚无可以安全保留的旧 Supabase 只读接口。未迁移的详情页在前端呈现“功能迁移中”，避免无限重试失效 API。未来开放某条写口之前必须重新对接 PG 领域规则、assignment scope、审批/验证和对应集成测试，不能仅撤掉守卫。
