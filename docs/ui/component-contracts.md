# OpenAirTwin UI 组件合同

> 状态：Phase 1 冻结合同
>
> 范围：核心桌面工作台，`1280x720` 及以上
>
> 视觉基准：`1440x900`，本合同不授权任何视觉变化

## 1. 合同规则

1. 一个 DOM 子树只有一个渲染所有者；公共组件、Feature 组件和命令式引擎不可同时修改同一子树。
2. 公共组件只接收语义属性和稳定 `id`，禁止接收任意颜色、间距、圆角、阴影或 z-index。
3. 组件只渲染 View Model 并发出 Command，不读取全局状态、不调用 REST、不访问兄弟 Feature DOM。
4. `id`、元素语义、标签、顺序、ARIA、键盘行为和焦点行为由 [DOM 兼容合同](dom-compatibility-contract.json) 冻结。
5. 组件几何由公共 CSS 类和 `--oat-*` Token 所有；Feature CSS 只能表达领域独有结构。
6. 所有公共组件必须覆盖 default、hover、focus-visible、disabled；可操作组件按需覆盖 active、pressed、busy、invalid、selected 和 empty。
7. Controlled 字段的值来自 Feature 快照，变更只通过命名 Command 提交；不得在渲染阶段回写状态。

## 2. 公共组件 API

| 组件 | 必需属性 | 可选语义属性 | DOM 与行为合同 | CSS 所有者 |
| --- | --- | --- | --- | --- |
| `Button` | `id`, `label`, `command` | `variant=default|primary|danger`, `size=default|compact`, `busy`, `disabled`, `pressed`, `icon` | 原生 `button[type=button]`；busy 时 disabled 且 `aria-busy=true`；图标 `aria-hidden` | `components.css` |
| `IconButton` | `id`, `label`, `command`, `icon` | `pressed`, `disabled`, `danger` | 原生 button；必须有 accessible name；稳定方形几何 | `components.css` |
| `ButtonGroup` | `label`, `children` | `orientation` | `role=group`；不吞掉子按钮焦点 | `components.css` |
| `Field` | `id`, `label`, `control` | `unit`, `help`, `error`, `disabled`, `readOnly` | `label[for]` 与 control ID 精确关联；错误使用 `aria-describedby`/`aria-invalid` | `components.css` |
| `NumberField` | `id`, `label`, `value`, `command` | `min`, `max`, `step`, `unit`, `disabled`, `readOnly` | 原生 number input；不改变当前解析、提交和失效时机 | `components.css` |
| `TextField` | `id`, `label`, `value`, `command` | `placeholder`, `autocomplete`, `disabled`, `readOnly` | 原生 text input；Enter 行为由显式 Command 定义 | `components.css` |
| `SelectField` | `id`, `label`, `value`, `options`, `command` | `disabled`, `help` | 原生 select；option 顺序和值保持兼容 | `components.css` |
| `UnitInput` | `field`, `unit` | `compact` | Unit 是字段结构的一部分，不进入输入 value | `components.css` |
| `Checkbox` | `id`, `label`, `checked`, `command` | `mixed`, `disabled` | 原生 checkbox；label 点击和 Space 保持浏览器行为 | `components.css` |
| `RadioGroup` | `name`, `label`, `value`, `options`, `command` | `disabled` | fieldset/legend 或等价 group 语义；方向键行为不弱化 | `components.css` |
| `RangeInput` | `id`, `label`, `value`, `command` | `min`, `max`, `step`, `disabled` | 原生 range；`input` 事件实时提交 | `components.css` |
| `Panel` | `id`, `children` | `surface`, `hidden`, `ariaLabel` | 不增加影响选择器和几何的意外 wrapper；ID 可透传 | `components.css` |
| `PanelHeader` | `title` | `subtitle`, `actions` | 标题和操作顺序固定；操作区不抢标题 accessible name | `components.css` |
| `CollapsibleGroup` | `id`, `summary`, `children` | `open`, `command` | 原生 details/summary；Enter、Space 和 toggle 语义保留 | `components.css` |
| `ScrollRegion` | `id`, `children` | `label`, `tabIndex` | 保留内部滚动边界、滚动位置和统一 scrollbar | `components.css` |
| `Badge` / `StatusBadge` | `label`, `tone` | `live`, `busy` | tone 仅为 neutral/success/warning/error；实时状态使用合适 live 语义 | `components.css` |
| `Progress` | `value`, `label` | `max`, `indeterminate` | 原生 progress 或等价 progressbar；值和 busy 状态同步 | `components.css` |
| `MetricGrid` / `Metric` | `items` | `dense` | label/value 顺序稳定；数值更新不改变网格几何 | `components.css`, `results.css` |
| `ListCard` | `title`, `meta` | `detail`, `selected`, `command`, `tone` | 可选时使用 button；selected 可访问且不只靠颜色 | `components.css`, `results.css` |
| `EmptyState` | `message` | `action` | 不嵌套额外 Panel；容器高度不因 loading text 抖动 | `components.css`, `results.css` |
| `Dialog` | `id`, `title`, `open`, `actions` | `variant`, `detail`, `onDismiss` | 保持 focus trap、Escape、backdrop、关闭后焦点恢复 | `shell.css` |
| `Tooltip` | `content`, `anchor` | `placement` | hover/focus 可达；Escape、scroll、resize 关闭；不接管业务点击 | `shell.css` |
| `LoadingOverlay` | `title`, `message`, `progress` | `cancellable` | 模态 busy 状态；取消 Command 仅在可取消时启用 | `shell.css` |
| `ChartFrame` | `id`, `title`, `host` | `legend`, `tooltip`, `empty`, `loading` | Canvas/SVG 引擎拥有 host 内部；普通组件更新不重建引擎 | `results.css`, `radar.css` |

## 3. 工作台组合组件

| 组件 | 当前实例 | 唯一所有者 | 允许组合 |
| --- | --- | --- | --- |
| `ControlPanel` | `#ui` | `shell:feature-registry` | PanelHeader、ModeSelector、ScrollRegion、FeaturePanel |
| `ModeSelector` | `#modeSelector` | `shell:feature-registry` | CollapsibleGroup、Feature mode buttons |
| `DeviceDock` / `DeviceCard` | `#deviceDock` 与五模式设备卡 | `shell:device-dock` 负责容器；各 Feature 负责自己的卡片值 | Field、IconButton、ButtonGroup |
| `ResultDock` | `#linkChannelSection` | `shell:result-dock` | FeatureResult、ScrollRegion、PanelHeader |
| `PerformanceDock` | `#performanceDock` | `shell:performance` | Badge、MetricGrid、Checkbox、ButtonGroup |
| `EntryMap` | `#entryScreen` | `shell:entry-map` | Search、Map host、Tile list、Primary action |
| `AppDialog` | `#appDialog` | `shell:overlay` | Dialog |
| `ParameterTooltip` | `#paramTooltipLayer` | `shell:overlay` | Tooltip |

## 4. 重复模式归属

| 生产模式 | 公共组件归属 | 当前 Feature 使用方 |
| --- | --- | --- |
| 普通、主、紧凑、图标、危险按钮 | `Button` / `IconButton` | 全部五个 Feature、Entry、Dialog、Performance |
| label + input/select + unit/help | `Field` 与类型化字段 | 全部五个 Feature、共享 Solver、设备精度编辑 |
| checkbox/radio/range | `Checkbox` / `RadioGroup` / `RangeInput` | Link、Mobility、Radio Map、DeepMIMO、Radar、Performance |
| 折叠参数组 | `CollapsibleGroup` | 共享 Solver、Radar Geometry/Targets/Waveform/CFAR/Propagation |
| 状态徽章和进度 | `StatusBadge` / `Progress` | Loading、Live Preview、Radar Job、DeepMIMO Dataset |
| 指标网格 | `MetricGrid` | Link、Mobility、Radio Map、Radar、Performance |
| 可选结果行 | `ListCard` | Link paths、Mobility waypoints、DeepMIMO datasets、Radar targets/detections/truth/paths |
| 空、加载、失败、取消、重试 | `EmptyState` + Status + Button | 所有异步 Feature 与结果区 |
| 图表外壳、图例、tooltip | `ChartFrame` / `Legend` / `ChartTooltip` | Link taps、Mobility timeline、Radio Map colorbar、Radar charts |
| 面板和滚动边界 | `Panel` / `ScrollRegion` | 控制栏、结果栏、设备栏、性能栏、Dialog、数据集面板 |

## 5. Feature 专属组件

以下模式不能因视觉相似被错误合并，其领域语义由 Feature 独占：

- Link：路径选择与 CIR/Tap 详情 View Model。
- Mobility：Waypoint 编辑、时间轴播放状态和轨迹采样 View Model。
- Radio Map：网格/网格面统计、领域 colormap 与色标范围。
- DeepMIMO：ROI、接收点估计、Dataset Job 和下载生命周期。
- Radar：目标/资产编辑器、波形、CFAR、Range-Doppler、检测/真值/路径关联和 3D 标签层。

Feature 专属组件仍必须组合公共 Button、Field、Badge、Metric、ListCard、ScrollRegion 和 ChartFrame，不能复制其核心几何或状态样式。

## 6. 变更与验收

新增 UI 前必须先在本文件登记公共组件或 Feature 专属理由，再在 [交互合同](interaction-contracts.md) 登记 Command，并更新浏览器生成的 DOM 合同。任何未归属 ID、未命名用户操作、跨所有者 DOM 写入或未登记 inline style 都会阻断 Phase 2。
