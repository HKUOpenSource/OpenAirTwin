# ADR 0001：核心工作台采用 React、TypeScript 与 Vite

- 状态：已接受
- 日期：2026-07-30
- 决策范围：核心桌面工作台；不包含教程网站和 Python 后端

## 背景

当前工作台已有 Feature Registry、领域 Controller/Transport、七个 CSS 模块和严格浏览器基线，但 UI 仍通过静态模板和命令式 DOM 维护。继续扩展会放大组件重复、所有权模糊和生命周期泄漏风险，同时一次性重写会危及五个生产工作流。

## 决策

最终 UI 渲染层采用 React + strict TypeScript，由 Vite 构建。迁移使用多个独立 Root 按完整子树渐进接管，最终收敛为一个 AppShell Root。Feature Registry、Feature state、Transport、Controller、Three.js、Leaflet 和 Canvas adapter 保持框架无关。

Python 服务在生产中提供 Vite manifest 指向的哈希资源；发布包包含构建产物，运行时不依赖 Node.js 或 Vite Dev Server。迁移不得改变 REST、DOM 兼容合同、操作流程、视觉快照或桌面范围。

## 后果

- 获得类型化 Props、View Model、Command 和清晰子树所有权。
- 增加 Node 构建依赖、lockfile、生产 manifest 和前端静态检查。
- 每个迁移边界必须同时删除 Legacy renderer/listener，禁止双实现长期共存。
- 普通 React 更新不得重建 Viewer、Leaflet Map 或 Canvas engine。
- Vite 接入、React 接管和 Legacy 删除必须分阶段提交并通过 Phase 0 全量回归。

## 未采用方案

- 保持纯命令式 DOM：无法从机制上约束组件所有权和重复模式。
- 一次性 React 重写：回归面过大，无法逐 Feature 证明等价。
- Next.js/SSR：核心工作台无 SEO/SSR 收益，会增加 Node 生产边界。
