<div align="center">

# 数智星图 · SHUZHI Campus OS

### 高校空间一体化智能中枢系统

**校园设施责任归属知识图谱 · AI Agent 驱动的校园智慧运营平台**

<br/>

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker)
![AI](https://img.shields.io/badge/AI-Agent-8b5cf6)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 项目简介

数智星图是一套面向高校的校园空间一体化智能运营中枢。平台以校园设施责任归属知识图谱为核心，整合学生报修、后勤派单、宿舍管理、卫生检查、教室预约、访客管理、失物招领、值日排班等校园日常运营场景，并通过 AI Agent「白泽」实现智能问答、工单自动分派、风险预警与跨部门协同。

## 核心能力

- **报修工单**：学生一键报修 → 自动分派 → 维修人员接单 → 完工闭环
- **宿舍管理**：宿舍分配、卫生检查、违纪记录、宿管值班
- **教室预约**：空闲查询、在线预约、使用统计、冲突检测
- **后勤调度**：工单池、人员负载、维修排行、备件管理
- **卫生检查**：院系卫生打分、排名公示、问题追踪
- **AI 白泽**：自然语言查询校园业务、智能派单建议、知识问答
- **知识图谱**：校园设施-部门-责任人关系图谱可视化
- **多角色协作**：管理员、辅导员、后勤、宿管、学生、教师等全角色
- **数据大屏**：报修统计、能耗分析、运营概览实时可视化

## 技术栈

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · ECharts · React Flow · LangChain · Zustand · Docker

## 快速开始

```bash
docker pull ghcr.io/a2-del/shuzhi:latest
docker run -d -p 3000:3000 ghcr.io/a2-del/shuzhi:latest
```

浏览器访问 http://localhost:3000

**演示账号**：登录页选择任意岗位，密码统一为 `123456`

## License

MIT