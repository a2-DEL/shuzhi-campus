# 数智星图校园服务平台 - Web管理后台

## 项目概述

数智星图校园服务平台 Web 管理后台是校园小程序的配套管理系统，面向现教中心管理员、院系管理员、辅导员、后勤管理员、宿管员等管理角色，提供全面的数据管理、业务审批、统计分析等功能。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **图表**: ECharts 6.x
- **状态管理**: Zustand 5.x
- **日期处理**: Day.js 1.x

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── login/          # 登录页面
│   │   ├── dashboard/      # 首页大屏
│   │   ├── users/          # 用户管理
│   │   ├── permissions/    # 权限管理
│   │   ├── repairs/        # 报修管理
│   │   ├── duties/         # 值日管理
│   │   ├── classrooms/     # 教室管理
│   │   ├── dormitories/    # 宿舍管理
│   │   ├── materials/      # 物资管理
│   │   ├── notifications/  # 通知管理
│   │   └── settings/       # 系统设置
│   ├── components/
│   │   ├── ui/             # Shadcn UI 组件库
│   │   └── layout/         # 布局组件
│   │       ├── sidebar.tsx # 侧边栏
│   │       ├── header.tsx  # 顶部导航
│   │       └── main-layout.tsx # 主布局
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   ├── stores/             # Zustand 状态管理
│   └── types/              # TypeScript 类型定义
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 开发规范

- **Hydration 错误预防**：严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染。
- 所有页面组件必须使用 `'use client'` 指令

## UI 设计规范

- 使用 shadcn/ui 组件库
- 主色调：蓝色 (#1890ff)
- 配色系统遵循设计指南

## 功能模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 登录 | /login | 用户登录认证 |
| 首页大屏 | /dashboard | 数据可视化展示 |
| 用户管理 | /users | 用户CRUD、角色分配 |
| 权限管理 | /permissions | 角色权限配置 |
| 报修管理 | /repairs | 工单管理、分配处理 |
| 值日管理 | /duties | 值日安排、记录查看 |
| 教室管理 | /classrooms | 教室预约、审批 |
| 宿舍管理 | /dormitories | 巡查记录、访客登记 |
| 物资管理 | /materials | 库存管理、申领审批 |
| 通知管理 | /notifications | 通知发布、管理 |
| 系统设置 | /settings | 系统参数配置 |

## 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 系统管理员 | admin | 123456 |
| 院系管理员 | dept | 123456 |
| 辅导员 | counselor | 123456 |
| 后勤负责人 | logistics | 123456 |
| 宿管负责人 | dorm | 123456 |

## 常用命令

```bash
# 开发环境
pnpm dev

# 构建生产版本
pnpm build

# 代码检查
pnpm lint

# 类型检查
pnpm ts-check
```
