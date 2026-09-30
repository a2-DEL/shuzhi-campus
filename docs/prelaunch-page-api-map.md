# 上线前页面—API 映射与迁移状态（2026-09-29）

以《附录_逐项测试执行记录.md》中 18 个出现下游失败的页面为基线。

| 页面 | 原出错依赖 | 现有动作 | 对用户的状态 |
|---|---|---|---|
| `/classrooms/[id]` | `/api/classrooms/[id]` 500 | 原 Supabase 详情鉴权后 503；页面不再发起失效请求 | 功能迁移中 |
| `/dormitories/[id]` | `/api/dormitories/[id]` 500 | 同上 | 功能迁移中 |
| `/duties/[id]` | `/api/duties/[id]` 500 | 同上 | 功能迁移中 |
| `/duties/records/[id]` | 不存在的 `/api/duty-records/[id]` 404 | 禁用失效请求 | 功能迁移中 |
| `/lost-and-found/[id]` | 错误的 `/api/lost-and-found/[id]` 404 | 源码改为实际 `/api/lost-found/[id]`；其旧详情仍禁用 | 功能迁移中 |
| `/materials/[id]` | `/api/materials/[id]` 500 | 原 Supabase 详情鉴权后 503；页面不再调用 | 功能迁移中 |
| `/messages` | `/api/student/messages` 500 | PG 投递表按当前用户读取；已读使用 PG 更新 | 已迁移 |
| `/messages/[id]` | `/api/notifications/[id]` 500 | 改为 `/api/student/messages/[id]`，按投递人鉴权 | 已迁移 |
| `/notifications/[id]` | `/api/notifications/[id]` 500 | 原 Supabase 详情鉴权后 503；页面不再调用 | 功能迁移中 |
| `/permissions/[id]` | 不存在的 `/api/roles/[id]` 404 | 入口展示迁移说明，不再请求不存在的路由；权限总览以 `/api/permissions/roles` 只读展示 | 功能迁移中 |
| `/profile` | `/api/repairs`、`/api/notifications` 500 | 报修迁 PG，并修正 reporter 使用内部 ID；通知摘要迁到 PG 业务读模型 | 已迁移读取 |
| `/repairs/[id]` | `/api/repairs/[id]` 500 | PG 工单详情+同一授权范围；旧写口隔离 | 已迁移读取 |
| `/student/dashboard` | 报修、值日、消息 500；`/student/dorm` 404 | 前三项迁 PG；移除未实现的宿舍详情链接，教室链接指向 `/classrooms` | 已迁移读取，宿舍待接入 |
| `/student/duties` | `/api/student/duty-service` 500 | PG 按有效 class assignment 读取 | 已迁移读取 |
| `/student/lost-found` | `/api/student/lost-found` 500 | PG 仅读自己报告/认领的记录；旧直接发布入口禁用并提示 | 已迁移受限读取，发布待治理 |
| `/student/profile` | `/api/student/profile` 500 | PG 按当前用户汇总报修、值日、失物、消息 | 已迁移 |
| `/student/repairs` | `/api/student/repair-progress` 500 | PG 按当前 reporter 读取 | 已迁移 |
| `/visitors/[id]` | `/api/visitors/[id]` 500 | 原 Supabase 详情鉴权后 503；页面不再调用 | 功能迁移中 |

未开放的旧详情接口由服务端统一返回 `LEGACY_FUNCTION_MIGRATING` 503；前端使用显式提示且**不主动请求**已知失效接口，从而避免以空白列表假装成功。新 PG 11 域读模型保持可用，但不等于每个旧详情表单已上线。
