# OpenAirTwin UI 组件体系与 React 迁移执行计划

> 文档状态：可直接执行
> 适用范围：核心桌面工作台
> 基线日期：2026-07-30
> 交付标准：可直接使用、可发布的生产版本，不交付 MVP
> 布局范围：支持 `1280x720` 及以上桌面视口，`1440x900` 为严格视觉基准

## 1. 最终目标

本计划分两步完成 OpenAirTwin UI 的长期建设：

1. 在现有技术栈上建立统一、可测试、可约束的组件体系。
2. 在所有合同和回归证据完备后，将 UI 渲染层渐进迁移到 React。

最终版本必须保持以下内容不变：

- Link、Mobility、Radio Map、DeepMIMO、Radar 五个 Feature 的完整工作流；
- REST URL、HTTP 方法、请求与响应结构、轮询、取消和错误处理行为；
- Feature Registry 的注册顺序、依赖、能力、状态、激活、停用和释放语义；
- 被运行时代码、测试、自动化或外部调用方使用的 DOM ID；
- 控件文案、排列顺序、键盘行为、焦点行为和操作步骤；
- Three.js、Leaflet、Canvas 及结果渲染逻辑；
- 已批准的 `1440x900` 视觉快照；
- `1280x720` 下不重叠、可滚动、可操作的桌面布局合同；
- 仅支持桌面端的产品范围。

最终发布版本采用内部 OpenAirTwin 组件库，使用 React 与 TypeScript 实现，由 Vite 构建，继续由现有 Python 服务提供应用入口和 API。

最终版本禁止保留：

- 同一功能的 Legacy 与 React 双重实现；
- 临时迁移开关；
- 占位界面或未完成控件；
- 已知功能、交互、视觉或可访问性偏差；
- 只能在 Vite 开发服务器中运行、无法独立发布的前端。

## 2. 已确定的技术决策

以下决策默认固定。只有遇到有测试证据的技术阻塞时，才允许通过 ADR 重新评估。

| 范畴 | 决策 | 原因 |
| --- | --- | --- |
| UI 框架 | React + TypeScript | 组件所有权清晰，组合能力成熟，支持渐进式接入。 |
| 构建工具 | Vite，并提交精确 lockfile | 支持传统后端、生产 manifest、哈希资源、代码拆分和快速开发。 |
| 渲染方式 | 客户端渲染 | 工作台是高度交互的 3D 工具，SSR 与 SEO 不提供实际产品价值。 |
| 后端 | 保留当前 Python 服务 | UI 建设不需要改变 REST 和后台运行时边界。 |
| 状态体系 | 保留 Feature Registry 和 Feature 自有状态，增加可观察的类型化适配层 | 避免重写领域逻辑，防止 React 成为第二个事实来源。 |
| 组件库 | 建设内部 `@oat/ui` 组件层 | MUI、Ant Design、Bootstrap 等带样式框架会改变 DOM、密度、焦点行为和视觉。 |
| Headless 库 | 默认不引入 | 只有通过 DOM、键盘和视觉等价验证后，才允许按组件采用。 |
| 样式体系 | 保留七个 CSS 模块、Cascade Layers 和 `--oat-*` Token | 当前 CSS 重构已经建立正确的样式职责边界。 |
| 移动端 | 不支持 | 核心工作台继续保持桌面端合同；教程网站独立维护。 |
| 浏览器范围 | 保持当前经过测试的桌面 Chromium/Chrome 范围 | 本轮不额外承诺未经验证的新浏览器范围。 |

React 支持用多个独立 Root 渐进接管页面区域，Vite 支持通过 manifest 与传统后端集成。本计划使用这两种能力：

- [React `createRoot` 官方文档](https://react.dev/reference/react-dom/client/createRoot)
- [Vite 后端集成官方文档](https://vite.dev/guide/backend-integration.html)

不采用 Next.js。OpenAirTwin 不需要服务端渲染、文件路由或 Node 生产服务器，引入 Next.js 只会扩大部署和维护范围。

## 3. 当前架构基线

当前核心工作台已经是模块化单体，而不是完全无结构的页面：

- `backend/static/index.html` 提供共享 Shell 和稳定的模板锚点；
- `backend/static/js/app.js` 创建应用 Context，并按 `mountTemplates -> initialize -> activate -> attachEvents -> render` 启动；
- `FeatureRegistry` 负责 Feature 发现、状态创建、依赖顺序、UI 引用、激活和释放；
- 每个 Feature 自有 state、transport、controller/result view、renderer 和 lifecycle；
- `dom_refs.js` 与 Feature 的 `queryDom()` 暴露了较大的命令式 DOM 合同；
- Feature 模板和动态结果行仍在使用 HTML 字符串或 `document.createElement()`；
- 核心 CSS 已拆分为七个分层模块，并开始使用公共 `oat-*` 类；
- Playwright 已覆盖五模式隔离、主要工作流、Radar 结果、资源、图表、快照和 `1280x720` 几何；
- Python 回归测试已覆盖静态架构、DOM 引用、CSS 规则和后端合同；
- Python 服务当前直接提供 `/css`、`/js`、`/assets` 和 `/lib`，尚无核心工作台生产构建步骤。

当前规模约为：

- 4,800 行第一方核心 CSS；
- 1,000 行静态 HTML 入口；
- 2,200 行浏览器合同测试；
- 多个仍直接操作 DOM 的结果渲染器和控制器。

因此必须逐区域转移所有权，禁止一次性重写整页。

### 3.1 开始实施前的前置条件

当前工作区包含已完成但尚未提交的 CSS 架构重构。Phase 0 必须先单独审查、验证并提交这部分修改。

React、TypeScript 或 Vite 迁移不得混入 CSS 拆分的同一提交序列，确保视觉基线和框架迁移可以独立定位、验证和回退。

## 4. 不可违反的工程规则

1. 同一 DOM 子树只能有一个所有者。React 与 Legacy 代码不能同时修改同一子树的子节点、属性、class、值或事件。
2. React 组件只接收类型化 Props，并发送类型化 Command。组件不得直接导入全局状态、调用 REST 或访问兄弟 Feature DOM。
3. Feature Controller 和 Transport 必须与框架无关，React 只进入 View 边界。
4. React 不得无订阅读取可变状态对象。状态适配层必须提供一致快照和显式更新通知。
5. Three.js、Leaflet 和 Canvas 继续作为命令式服务存在，React 只管理其宿主和生命周期。
6. 普通 React 更新不得重建 Viewer、WebGL Canvas、Leaflet Map 或 Canvas 图表引擎。
7. 现有 DOM ID 必须保持唯一和稳定，除非未来通过独立的版本化合同明确废弃。
8. CSS 选择器不能依赖 React 意外生成的包装层。
9. 组件必须复现现有 DOM 几何、控件密度和状态样式。
10. 禁止在 `tokens.css` 外写颜色字面量。
11. 禁止任意 z-index、未批准的 `!important` 和一次性静态 inline style。
12. inline style 仅允许用于 crosshair、reserve、transform、目标标签和数据色板等已记录的运行时变量。
13. 新 Feature 必须优先组合公共组件，不能先创建 Feature 专属按钮、字段、卡片或面板。
14. 每一个迁移提交都必须保持默认应用可用。
15. 开发期的等价验证开关不得进入最终发布。
16. 禁止为了让测试通过而直接更新视觉快照。

## 5. 目标架构

```text
Python Server
  -> REST 与 Feature Service（保持不变）
  -> 构建后的工作台 HTML 与哈希资源
      -> React AppShell
          -> OpenAirTwin Design System
          -> FeatureRegistry Adapter
              -> Feature State 与类型化 Command
              -> Transport / Controller Service
              -> Result View Model
              -> Three.js / Leaflet / Canvas Adapter
```

推荐目录：

```text
workbench/
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    app/
      AppShell.tsx
      AppProviders.tsx
      ErrorBoundary.tsx
    design-system/
      components/
      hooks/
      contracts/
      catalog/
    runtime/
      feature-registry-adapter.ts
      ui-store.ts
      command-bus.ts
      legacy-bridge.ts
    shell/
    entry-map/
    features/
      link/
      mobility/
      radiomap/
      deepmimo/
      radar/
    styles/
      tokens.css
      base.css
      components.css
      shell.css
      entry-map.css
      results.css
      radar.css
    test/
backend/static/
  workbench/          # 生成的生产入口和哈希资源
  assets/             # 保留现有稳定资源路径
  lib/                # 仍需要的第三方运行时资源
```

最终切换后：

- `workbench/` 是核心 UI 唯一可编辑源码；
- 生产输出构建到 `backend/static/workbench/`；
- Python 服务的 `/` 返回构建后的 `index.html`；
- 发布包包含构建产物，运行时不需要 Node.js；
- 本地开发由 Vite 提供前端资源，并代理 `/api`、`/assets` 和必要的运行时资源；
- 生产 HTML 不缓存；
- 带内容哈希的 JS/CSS 资源使用 immutable 缓存；
- Python 启动时或发布检查中验证 manifest 与入口资源完整。

## 6. 标准组件体系

### 6.1 Token 合同

`tokens.css` 继续作为唯一设计值来源，Token 分为四层：

1. 基础 Token：原始色板、间距、字号、圆角、阴影、时长、缓动和层级。
2. 语义 Token：surface、text、border、action、focus、success、warning、error 和 disabled。
3. 组件 Token：控件高度、面板内边距、Dock 尺寸、列表行几何、图表 Chrome 和 Dialog 几何。
4. 运行时输入：由 JS 写入的 crosshair、图例、目标标签、结果区 reserve 等动态值。

约束：

- 所有静态 Token 使用 `--oat-*` 命名空间；
- 语义和组件 Token 引用基础 Token，不重复写字面量；
- 运行时输入单独记录，不伪装成主题 Token；
- React Props 只能选择语义 Variant，不能传入任意颜色、圆角、阴影或间距；
- Canvas UI Chrome 统一通过 `readUiToken()` 或其类型化版本读取；
- Feature 数据色板继续由领域模块管理；
- 自动检查缺失、未使用、循环引用和非法字面量。

### 6.2 公共组件清单

在迁移 Feature 前，公共组件必须覆盖所有重复模式。

| 组件族 | 公共组件和 Variant | 必须覆盖的状态 |
| --- | --- | --- |
| 操作 | `Button`、`IconButton`、`ButtonGroup` | 默认、primary、compact、danger、busy、disabled、pressed |
| 字段 | `Field`、`NumberField`、`TextField`、`SelectField`、`UnitInput` | 默认、focus、disabled、invalid、read-only、help |
| 选择 | `Checkbox`、`RadioGroup`、`SegmentedControl`、`RangeInput` | checked、mixed、disabled、focus-visible |
| 结构 | `Panel`、`PanelHeader`、`CollapsibleGroup`、`ScrollRegion`、`SectionHeader` | expanded、collapsed、hidden、overflow |
| 状态 | `Badge`、`StatusBadge`、`Progress`、`LiveStatus`、`ErrorMessage` | neutral、success、warning、error、busy |
| 数据 | `MetricGrid`、`Metric`、`ListCard`、`EmptyState`、`KeyValueList` | selected、hover、keyboard focus、文本截断 |
| 浮层 | `Dialog`、`Tooltip`、`LoadingOverlay` | open、closing、warning/error、focus return |
| 工作台 | `DeviceCard`、`DeviceDock`、`ResultDock`、`PerformanceDock`、`ModeSelector` | active Feature、collapsed、disabled、busy |
| 图表 | `ChartFrame`、`Legend`、`ChartTooltip` | empty、loading、populated、focused、现有全屏状态 |

每个公共组件必须具备：

- 不包含 Feature 专属属性的类型化 API；
- 明确的 DOM 结构、稳定 class 和 ID 透传能力；
- 语义 HTML 与 ARIA 行为；
- 键盘和焦点行为；
- Controlled/Uncontrolled 使用规则；
- 全部状态的组件目录示例；
- 单元、交互、可访问性和截图测试；
- 明确的 CSS 所有者；
- 不依赖 Feature 选择器覆盖核心几何。

### 6.3 组件目录

增加仅开发环境可访问的 `/ui-catalog/` 入口，使用与生产相同的组件和 CSS。

组件目录必须覆盖：

- 所有 Variant 与状态；
- 长标签和长数值；
- 空值和空列表；
- 错误文案；
- disabled、busy 和 keyboard focus；
- 指标密集场景；
- 滚动与文本溢出；
- Dialog、Tooltip、列表、字段和图表容器。

组件目录不是新设计稿，而是现有 UI 合同的可执行展示。它不能被 Python 生产路由提供，也不能进入生产入口 Bundle。

### 6.4 新 Feature 的 UI 规则

新 Feature 必须声明：

- 通过 `defineFeature` 或类型化替代接口注册的元信息与依赖；
- 类型化 State Factory；
- 可序列化的 UI View Model；
- 所有用户操作对应的类型化 Command；
- 每个界面区域使用的公共组件；
- 每条 Feature 专属 CSS 的领域理由；
- Picking Target 和 Viewer Layer；
- 生命周期、隔离、浏览器工作流和视觉测试。

迁移完成的 Feature 中，静态分析必须禁止：

- 直接 `document.getElementById`；
- `innerHTML`；
- `insertAdjacentHTML`；
- 任意 `document.createElement`。

Leaflet、Three.js 标签层、SVG/Canvas 和明确登记的兼容适配器可以保留受控的命令式 DOM。

## 7. 迁移原则与顺序

采用 Strangler Pattern。Legacy 应用在迁移期间继续作为默认生产路径，每次只迁移一个完整 UI 边界。

一个边界只有同时满足以下条件才算完成：

- React 独占该 DOM 子树；
- Legacy 渲染器和事件绑定已经删除；
- DOM、交互、视觉、资源和生命周期测试全部通过；
- 不需要运行时双写或双渲染。

### 7.1 所有权迁移顺序

1. 组件目录与公共 Primitive，不改变生产所有权。
2. DeepMIMO 数据集栏和简单重复结果行。
3. Link、Mobility、Radio Map 结果区域。
4. Radar 结果区域、图例、筛选器和 Canvas 宿主。
5. 公共 Device Card、Device Action、Result Dock 和 Performance Dock。
6. Link、Mobility、Radio Map、DeepMIMO 控制面板。
7. Radar 控制面板、目标编辑器、Job 状态和目标列表。
8. Loading、Dialog、Tooltip 和 Mode Selector。
9. Entry Map Shell 与 Leaflet Adapter。
10. 合并为单一 React AppShell Root，并删除兼容桥。

这个顺序先迁移“状态到视图”的渲染区域，把依赖 DOM 读取的表单、Radar 动态模板和 Leaflet 所有权放到后期。

### 7.2 禁止双重所有权

每个迁移边界按以下步骤实施：

1. 在 Legacy 子节点之外增加空的稳定 Mount 节点。
2. 定义该边界需要的 View Model 和 Command。
3. 仅在等价测试模式下渲染 React 实现。
4. 对比 DOM 合同、交互、computed style、截图和释放行为。
5. 在同一工作包中切换所有权并删除 Legacy 渲染与事件逻辑。
6. 运行完整工作台测试后再迁移下一个边界。

`createRoot()` 会清空 Mount 节点，因此禁止把它挂载到仍含 Legacy 所有子节点的节点上。

迁移期 Root 必须集中登记，并通过 Feature `dispose()` 或 Shell Teardown 执行 `unmount()`。Dialog 和 Tooltip 只有在 Root 所有权稳定后才使用 Portal。

## 8. 分阶段执行计划

### Phase 0：冻结并提交当前基线

交付物：

- 独立审查并提交当前七文件 CSS 架构；
- 框架开发开始前确保工作区干净；
- 保持全部现有 `1440x900` 快照不更新；
- 保存 `1440x900` 与 `1280x720` 全屏和组件基线；
- 导出 DOM 合同，包括 ID、Tag、Role、Label、ARIA 关系、控件顺序、默认值和初始显隐状态；
- 导出公共组件代表状态的 computed style；
- 记录网络请求、初始 JS/CSS 传输、启动耗时；
- 记录连续切换五个 Feature 后的监听器、Timer、DOM 和内存基线；
- 记录当前支持的 Chrome/Chromium 与运行系统范围。

阻断门槛：

- Python 与 Playwright 完整测试通过；
- 所有 CSS 请求为 200；
- 浏览器 Console 无错误或警告；
- 五个 Feature 均能从空状态完成工作流；
- 所有基线证据已版本化；
- 基线提交不包含 React、TypeScript 或 Vite 迁移。

### Phase 1：先定义合同，再实现组件

交付物：

- `docs/ui/component-contracts.md`：组件结构、属性和状态表；
- `docs/ui/dom-compatibility-contract.json`：浏览器测试生成的 DOM 合同；
- `docs/ui/interaction-contracts.md`：鼠标、键盘、焦点、异步、取消、重试和折叠行为；
- 类型化的 `FeatureDefinition`、`FeatureInstance`、`UiRef`、View Model、Command 和 Lifecycle 接口；
- 命令式 DOM 与 inline runtime style 例外清单；
- React + TypeScript + Vite ADR；
- 不采用带样式第三方组件库的 ADR。

阻断门槛：

- 每个重复生产模式都有公共组件归属或明确的 Feature 专属归属；
- 每个 DOM ID 都有所有者和兼容状态；
- 每个现有用户操作都映射到命名 Command；
- 所有权不明确时禁止进入实现阶段。

### Phase 2：在现有 UI 中完成组件标准化

> 执行状态：已完成（2026-07-30）。原生组件目录、机器可读组件清单、Alias 退役合同、图标合同和自动化门禁已落地；现有产品视觉快照保持不变。

交付物：

- 将 `.btn`、`.miniBtn` 和重复 Feature 行等 Legacy Alias 收敛到公共 `oat-*` 合同；
- 补齐 hover、focus-visible、active、disabled、busy、selected、invalid 和 empty 状态；
- 删除 Feature 对公共组件核心几何的覆盖；
- 集中管理图标，并规定尺寸、描边、对齐和 accessible name；
- 用当前原生标记建立组件目录；
- 增加 Token、Layer、选择器归属、非法字面量、inline 表现和重复模式检查；
- 制定 Alias 废弃规则：仅允许保留到对应 React 所有者迁移完成。

阻断门槛：

- 组件目录覆盖全部公共 Variant；
- 不存在未解释的重复组件实现；
- 现有产品快照完全不变；
- 一个测试 Feature 能只使用公共组件组成面板、字段、操作、指标、列表和结果区。

### Phase 3：先引入生产前端工具链，不改变 UI

> 执行状态：已完成（2026-07-30）。生产构建、Python 静态资源集成、开发命令、发布校验和生产浏览器回归均已落地；未引入 React，产品 DOM、交互、computed style 与视觉快照保持原基线。

交付物：

- 创建 `workbench/`；
- 固定 Node/npm 策略和 lockfile；
- 启用 strict TypeScript、Vite、ESLint、Stylelint 和格式检查；
- 将现有前端源码接入 Vite，同时通过兼容 Alias 保持导入与资源 URL；
- 保持 index、七个 CSS 的加载顺序、Leaflet CSS 顺序和 Bootstrap 行为；
- 生成 Vite manifest 与哈希资源；
- 更新 Python 静态资源处理，安全提供构建后的工作台；
- 增加同时启动 Python API 与 Vite 的开发命令；
- 增加仅使用生产构建、没有 Vite Dev Server 的 Smoke Test；
- 确保组件目录、测试、迁移诊断和不应发布的 Source Map 不进入生产包。

阻断门槛：

- 浏览器完整测试针对生产 Build 通过；
- `/`、`/api`、`/assets`、`/lib` 和 Feature 资源行为不变；
- 发布包只需 Python 即可启动；
- Clean Clone 能按文档完成 install、test、build 和 run；
- Cache Header 不会导致新旧 Bundle 混用。

实现记录：

- `workbench/package-lock.json` 精确锁定 Node 工具依赖，支持 `npm ci` 可重复安装；
- `npm run dev` 同时启动 Python API 与 Vite，默认入口为 `http://127.0.0.1:5173/workbench/`，`/api` 由 Vite 代理；
- `npm run check` 依次执行 strict TypeScript、ESLint、Stylelint 和 Prettier 检查；
- `npm run build` 输出带内容哈希的 JS、CSS 和图片资源、Vite manifest 及兼容 Import Map，并执行独立产物校验；
- 生产构建保留现有 ES Module 边界，旧 `/js/*.js` 及带 `?v=` 的模块 URL 映射到同一个哈希模块，避免重复状态实例；
- CSS 不执行会改写 token 文本值的压缩，以维持 Phase 0 computed-style 严格合同；其余生产资源保持 Vite 优化与内容哈希；
- `OAT_REQUIRE_WORKBENCH_BUILD=1` 或 `tools/run_production_server.py` 强制 Python 只使用已验证的生产构建；缺失或损坏时启动失败；
- HTML 使用 `no-store`，哈希资源使用 `public, max-age=31536000, immutable`，manifest、Source Map、非哈希路径和目录穿越请求不对外提供；
- `backend/static/workbench/` 为可再生构建产物，不提交 Git；发布流水线必须先执行 `npm ci && npm run build`，再打包该目录。

### Phase 4：建立 React 基础与兼容桥

交付物：

- 固定 React 与 React Vite Plugin 版本；
- 实现 `AppProviders`、Error Boundary 和 Root Error Hook；
- 用 Phase 2 合同实现类型化公共组件；
- 为 Feature State 增加兼容 `useSyncExternalStore` 的可观察适配层；
- React 组件通过 Command 操作应用，不直接修改 HTMLElement；
- 实现 Root 登记、Unmount、焦点恢复和订阅清理；
- 使用真实 React 组件渲染组件目录；
- React 组件目录与 Native 目录逐项对比；
- 使用 Fake Timer 覆盖轮询、Busy、Cancel 和 Cleanup。

阻断门槛：

- 在组件等价验证通过前，React 不接管生产 UI 子树；
- React 与 Native 组件目录截图和 computed style 一致；
- Dispose 后没有重复 Listener、Timer、Subscription、WebGL Resource 或 Root；
- 组件异常进入现有用户可见错误路径，不产生空白工作台。

### Phase 5：迁移结果区与重复数据 UI

按既定顺序一次迁移一个完整边界。

交付物：

- Link Path/Tap、Mobility Timeline、Radio Map Summary/Colorbar、DeepMIMO Dataset、Radar Detection/Truth/Path 的类型化 View Model；
- React 版结果行、Badge、Metric Grid、List Card、Empty State、Filter 和 Chart Frame；
- SVG 与 Canvas 绘制引擎保持独立的 Adapter；
- 保持 Selection、Scroll、Focus、Hover、Tooltip、Collapse、Result Reserve 和 Radar Fullscreen 行为；
- 每个边界切换后删除对应的 `innerHTML` 与 `createElement` 渲染器。

每个 Feature 的阻断门槛：

- Success、Empty、Loading、Cancelled、Failed、Retried 和 Stale Result 状态一致；
- Result Payload 和失效逻辑不变；
- 视觉快照与 computed style 不变；
- 切换 Feature 后不会出现上一个 Feature 的结果；
- 重复激活不会泄漏事件、Timer、DOM 或图形资源。

### Phase 6：迁移控件、表单和设备 UI

交付物：

- 由 Feature State 驱动的 Controlled React Field；
- 精确复现当前 Payload 数值和错误时机的类型化校验与解析；
- 公共 Device Card、Pick Action、Solve Action、Antenna Control 和 Collapsible Group；
- 保持 Pointer Picking、Precision Input、Tx Orbit、ROI、Radar Target、Escape 和 Busy 行为；
- 从 `dom_refs.js`、Feature `queryDom()` 和 Controller 中删除已迁移 DOM 访问；
- Radar Panel 切换后删除 Template String 字段工厂。

每个 Feature 的阻断门槛：

- 代表性输入生成的请求 Payload 与基线 Fixture 深度相等；
- 默认值、step、min、max、label、unit 和错误文案不变；
- 无关状态更新不会导致输入失焦；
- 异步按钮不能重复提交，失败后必须恢复；
- 五个 Feature 都通过真实浏览器事件完成完整流程。

### Phase 7：迁移全局 Shell 与 Entry Map

交付物：

- React 接管 Mode Selector、Control Shell、Dock、Performance、Loading、Dialog 和 Tooltip；
- Leaflet Adapter 始终只管理一个 Map Instance；
- 保持搜索、选 Tile、下载、进度、Focus、进入场景、返回和 Resize 行为；
- Three.js Canvas Host 保持稳定，普通 Shell 更新不重建 Canvas；
- 最终使用一个 `AppShell` Root；
- 只为批准的浮层目标使用 Portal；
- 覆盖 Interval、Map Listener、Document/Window Handler、Feature Instance 和 Viewer Resource 的释放。

阻断门槛：

- Entry Map 与五个 Feature 可在同一会话中连续工作；
- Feature 切换、场景进出、折叠、Resize、Dialog Focus 和 Performance 行为与基线一致；
- 工作台只有一个 React Root；
- 不存在生产 Legacy Root 或重复 Shell；
- 普通 UI 更新不产生空白帧、Canvas Reset、Camera Reset 或 Map 重建。

### Phase 8：删除 Legacy 渲染层

交付物：

- 删除 Legacy Template Injection、DOM Factory、兼容 Root、临时 Flag 和已经迁移的 Alias；
- 将 `dom_refs.js` 缩减为命令式引擎真正需要的类型化 Ref/Adapter；
- 保留类型化 FeatureRegistry 作为领域和生命周期 Registry；
- 只有在行为测试充分时才允许进一步改写 Registry；
- 删除无引用 Selector 和 Token；
- 验证生产 Bundle 不含组件目录、测试 Fixture、迁移诊断或重复 UI；
- 更新架构、开发、Feature 开发和故障排查文档。

阻断门槛：

- 静态检查只在批准的例外中发现命令式 DOM；
- 不存在已废弃 Alias 或兼容 Flag；
- Source Map 与 Bundle Analysis 证明每个 UI 边界只有一个实现；
- 新 Feature 只有一条从注册到发布的 React 开发路径。

### Phase 9：生产加固与发布候选

交付物：

- 依赖 License 与安全审计；
- 不允许存在未解决的 High/Critical 生产依赖问题；
- CI 中使用 `npm ci` 完成确定性构建；
- Build Artifact 完整性校验和 Frontend Build ID；
- 基于 Phase 0 数据建立首屏与 Feature Chunk 预算；
- 在不改变体验时执行 Feature Lazy Loading；
- 重复 Feature 切换、Result Run、Dialog Cycle 和 Entry Map Transition 的内存/泄漏 Soak；
- Error Boundary、Chunk Load Failure、Asset Failure、API Offline、Timeout、Cancel 和 Retry 覆盖；
- 从准确 Release Artifact 执行 Clean Install；
- 更新 Release Checklist、Changelog 与 Rollback 流程。

最终阻断门槛：

- 第 12 节 Definition of Done 全部通过；
- 测试 Commit 与打包 Commit 完全一致；
- 不通过更新基线隐藏无法解释的差异；
- Release Candidate 不含已知功能、交互、可访问性或视觉回归。

## 9. 测试与证据矩阵

### 9.1 静态与架构检查

- CSS 模块与 Cascade Layer 顺序；
- Token 声明和使用图；
- 颜色字面量策略；
- 仅允许批准的 `!important` 和 Runtime Variable；
- 组件 Import Boundary 和 Feature 所有权；
- 禁止跨 Feature 直接访问 State 或 DOM；
- 已迁移代码中不存在未批准 DOM API；
- DOM ID 唯一；
- 生产代码不能 Import Catalog、Test 或 Migration Diagnostics；
- Vite Manifest 完整；
- 每个构建资源请求均返回 200。

### 9.2 单元与组件测试

- 每个公共组件的 Variant 和状态；
- Controlled Input 与精确数值解析；
- Keyboard Activation 和 Focus Return；
- Busy、Error、Cancel 和 Retry；
- External Store Snapshot 一致性；
- Lifecycle Cleanup 与 Timer Cancel；
- View Model 格式化、空状态和截断；
- Error Boundary 恢复路径。

### 9.3 浏览器行为测试

保留现有 Playwright Suite，并增加：

- 五个 Feature 从空状态到成功结果；
- Job 前、中、后切换 Mode；
- Cancel、Stale Response、Retry 和 Server Failure；
- Collapse/Expand 与内部 Scroll 保持；
- Map Search、Tile Selection/Download、Enter Scene 和 Return；
- Pointer Picking、Precision Editing、Tx Orbit、ROI 和 Radar Target；
- Dialog Focus Trap 与 Focus Restore；
- 重复 Mount/Unmount 不产生重复事件；
- 全套测试同时覆盖 Vite Dev 与 Production Build，其中发布门槛以 Production Build 为准。

### 9.4 视觉测试

- 原有 `1440x900` 快照继续作为严格基准；
- 保留 `1280x720` 几何和不重叠断言；
- 为全部公共组件状态增加 Catalog Snapshot；
- 对比 Full Screen、Dock、Panel、Dialog、Tooltip、Chart、Empty、Error、Busy 和 Selected；
- 对受平台抗锯齿影响的控件增加 computed style Diff；
- 每个阶段维护 Fidelity Ledger；
- 本轮预期产品可见差异为零。

### 9.5 可访问性测试

- Role、Accessible Name、ARIA Controls/Expanded/Hidden/Busy/Live；
- Tab Order、Enter/Space、Escape、Focus Visible 和 Focus Restore；
- Label 与 Validation 关联；
- Dialog 外无 Keyboard Trap；
- 动画遵循 `prefers-reduced-motion`；
- Axe 自动检查加完整手动键盘流程；
- 修复不得改变已批准视觉效果。

### 9.6 性能与资源测试

Phase 0 先记录真实基线，再建立发布预算：

- UI Ready 不超过记录基线允许的回归范围；
- React 运行时有单独的压缩体积预算；
- Lazy Load 不改变 Feature 第一次操作的行为；
- 普通更新不重挂 Three.js Canvas 或 Leaflet Map；
- 重复流程后 Listener、Timer、DOM、GPU Resource 和 Heap 不持续增长；
- 生产资源使用稳定 Hash 和正确 Cache Header。

在 Phase 0 测量之前不虚构具体性能阈值。最终阈值必须基于相同设备、浏览器和场景的可重复数据，并记录在基线文档中。

## 10. CI 与发布流水线

CI 固定顺序：

1. 从锁定依赖安装 Python 和 Workbench 环境。
2. 运行格式、TypeScript、ESLint、Stylelint、架构和单元测试。
3. 构建 Production Workbench。
4. 仅使用 Production Build 启动 Python 服务。
5. 运行 Python Contract Test 和 Playwright Functional Test。
6. 检查 Vite Manifest、Asset Hash、Response Header、Console 和 Network。
7. 打包准确的已测试静态产物。
8. 运行 Clean Artifact Smoke Test。
9. 只有 Release Checklist 和本地 macOS 视觉门槛通过后才允许发布。

发布运行时不得要求：

- `node_modules`；
- Vite Dev Server；
- TypeScript；
- 前端源码；
- 组件目录或测试 Fixture。

Node.js 只属于构建和测试环境。

## 11. 风险与控制

| 风险 | 失败表现 | 控制方式 |
| --- | --- | --- |
| DOM 双重所有权 | 输入丢失、重复事件、React Warning | 单一所有者、空 Mount、切换时删除旧 Renderer。 |
| 可变状态撕裂 | UI 同时显示不同版本的 Feature State | 一致 Snapshot 的 Observable Adapter 与类型化 Command。 |
| 焦点回归 | Rerender 后键盘流程中断 | 稳定 Key、Focus Contract、Dialog Focus Return Test。 |
| WebGL/Leaflet 重挂 | Camera/Map Reset 和资源泄漏 | 稳定 Imperative Adapter 与 Lifecycle Soak。 |
| CSS Specificity 漂移 | Token 相同但像素变化 | 固定 Layer、组件归属检查、截图与 computed style Diff。 |
| Template 改变 DOM | Hook 或测试失效 | DOM Compatibility Export 与 ID/Role/Order 检查。 |
| 表单迁移改变 Payload | Solver 行为变化 | 每个 Feature 的请求 Fixture 深度比较。 |
| 异步 Closure 错误 | 旧 Job 覆盖当前结果 | Generation ID、Abort/Cancel 和 Stale Result Test。 |
| Build Path 或缓存错误 | 发布空白或新旧 Bundle 混用 | Manifest Test、Hash Asset、HTML No-cache、Artifact Smoke。 |
| Bundle 增长 | 首次加载变慢 | 基线预算、Bundle Report、按需 Chunk、禁止重复库。 |
| 依赖漂移 | 发布不可复现 | 精确 Lockfile、计划升级、安全与 License Gate。 |
| 兼容层长期存在 | 最终维护两套 UI | Phase 8 强制删除，Legacy Owner 未归零则禁止发布。 |

## 12. 最终 Definition of Done

只有以下全部完成，项目才可被视为可直接使用和发布。

### 12.1 产品完整性

- [ ] Link、Mobility、Radio Map、DeepMIMO 和 Radar 全部可用。
- [ ] Entry Map、Scene Loading、Tile Selection/Download、Device Placement、Solver、Result、Dialog、Tooltip、Performance 和所有 Failure/Retry 流程正常。
- [ ] 不包含 Placeholder、禁用替代、`TODO`、隐藏 Legacy Route 或未完成状态。
- [ ] REST、Feature Lifecycle、操作顺序、Label、DOM ID 和 Result 保持不变。

### 12.2 视觉与交互等价

- [ ] 原有 `1440x900` 快照无需更新即可通过。
- [ ] `1280x720` 下 Panel 与 Dock 不重叠且可操作。
- [ ] Component Catalog 覆盖全部公共状态。
- [ ] Keyboard、Focus、Pointer、Scroll、Collapse、Hover、Busy 和 Error 行为与基线一致。
- [ ] Fidelity Ledger 不含未解释或默认接受的差异。

### 12.3 可维护性

- [ ] 每个重复 UI 模式只有一个内部公共组件。
- [ ] 所有静态设计值都来自 Token。
- [ ] Feature UI 使用类型化 View Model 和 Command，不直接修改全局 DOM。
- [ ] 公共组件具备类型 API、文档、测试和明确 CSS Owner。
- [ ] 新 Feature 无需在 AppShell 中加入 Feature 专属分支。
- [ ] 不存在 Legacy UI Renderer、Deprecated Alias、临时 Root 或 Migration Flag。

### 12.4 生产质量

- [ ] Clean Clone 的 install、lint、test、build、package 和 run 全部成功。
- [ ] Python 运行时无需 Node 即可提供已测试生产产物。
- [ ] Console 与 Network 日志干净，所有资源存在且缓存安全。
- [ ] Security、Dependency、License、Performance、Memory 和 Cleanup Gate 全部通过。
- [ ] Development Guide、Architecture Map、Changelog 和 Release Checklist 已更新。
- [ ] 测试、打包和 Tag 对应同一个 Commit。

## 13. Codex 执行协议

后续开发可以完全由 Codex 按以下规则持续执行：

1. 每个工作包先使用 CodeGraph 检查目标边界、调用方和测试。
2. 每个提交只包含一次所有权迁移或一项基础设施修改。
3. 修改前记录目标 DOM、交互、状态和测试合同。
4. 实现最小但完整的纵向边界，并在同一工作包删除被替换路径。
5. 先运行 Focused Test，再运行完整 Python 和 Browser Suite。
6. 每阶段保存两个桌面尺寸的前后截图和证据报告。
7. Snapshot、Payload、DOM、Focus、Console 或 Resource 的任何差异都先视为缺陷。
8. 禁止仅因为迁移导致输出变化就更新基线。
9. 生产默认始终指向最后一个完整验证的实现。
10. 开发期 Parity Flag 不进入最终 Release。
11. 一个阶段只有达到全部 Gate 才能结束。
12. 不把“代码已写完”视为完成，必须同时完成验证、清理、文档和发布证据。

建议提交组：

```text
ui-baseline: 提交 CSS 架构和回归证据
ui-contracts: 增加 DOM、交互、组件和状态合同
ui-components: 标准化原生组件状态与目录
ui-build: 引入 TypeScript/Vite 生产集成
ui-react-core: 引入 React Primitive、Store Adapter 和 Lifecycle Bridge
ui-react-results: 按 Feature 迁移结果边界
ui-react-controls: 按 Feature 迁移控件和设备工作流
ui-react-shell: 迁移全局 Shell 与 Entry Map
ui-cleanup: 删除 Legacy Renderer 和兼容路径
ui-release: 加固、文档、打包并验证 Release Candidate
```

## 14. 下一执行工作包

下一项开发任务只执行 Phase 4：

1. 固定 React、React DOM 与 Vite React Plugin 版本，并记录 License 和 Bundle 基线。
2. 建立 AppProviders、Error Boundary、Root Lifecycle 和 External Store Adapter，不接管生产 UI 子树。
3. 使用 Phase 2 合同实现类型化 React Primitive，并在组件目录中与 Native 实现逐项对比。
4. 保持现有 Feature Controller、Transport、DOM ID、操作逻辑、computed style 和视觉快照不变。
5. 只有组件等价、生命周期清理和完整生产 Build 回归全部通过后，才允许进入 Phase 5。
