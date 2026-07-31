# OpenAirTwin UI 交互合同

> 状态：Phase 8 生产合同。本文定义行为语义；逐控件的机器映射位于 `dom-compatibility-contract.json` 的 `interaction` 字段。

## 1. Command 规则

- 命名格式为 `<owner>.<subject>.<verb>`；同一业务动作只有一个名称。
- Command 包含业务意图和最小 payload，不传 HTMLElement、Event 或可变全局对象。
- 组件发出 Command；Feature Controller/Service 执行副作用；View Model 更新后重新渲染。
- 异步 Command 必须定义 idle、busy、success、empty、cancelled、error、retry 和 stale-response 行为。
- busy 期间提交按钮 disabled 且 `aria-busy=true`；失败后恢复可操作状态并进入现有可见错误路径。
- Feature 切换会取消 Live Preview、停止 Tx Orbit、清理 picking 和 transient UI；不得显示上一 Feature 结果。

### 1.1 Phase 6 控件 Command Envelope

React 控件边界只发出以下类型化基础 Command，由 App/Feature runtime 路由到本文件定义的领域命令；它们不替代领域语义：

| Command | Payload | 提交时机 |
| --- | --- | --- |
| `workbench.control.draft` | `{controlId, value}` | number/text 的原生 `input`，仅保持受控值与焦点 |
| `workbench.control.commit` | `{controlId, value, checked?}` | number/text 的 blur 或原生 `change`；select/checkbox/radio 的 change |
| `workbench.control.action` | `{actionId, value?}` | Button、动态 ListCard 和设备操作激活 |
| `workbench.control.group.toggle` | `{controlId, open}` | 有 ID 的 details 原生 toggle |

同一 radio `name` 的 checked 更新必须在一个快照内原子完成。Solver 按钮的 busy 集合按 `actionId` 去重，重复提交是 no-op，成功或失败都必须清除 disabled/`aria-busy`。Controller 可以通过登记的稳定 Ref 读取 HTMLElement 以完成领域解析和 Viewer 同步，但不得再为 React 所有字段或按钮绑定 click/change 监听。

## 2. Shell 与入口命令

下表命令由单一 `app-shell` CommandBus 发出。Shell 不再直接为按钮、checkbox、Mode 或动态地点结果注册分散监听；Leaflet、Three.js 与 Feature Adapter 接收命令后执行领域副作用。

| 命令族 | 触发方式 | 行为和焦点合同 |
| --- | --- | --- |
| `workbench.mode.select` | Mode 按钮 click/键盘激活 | 关闭菜单和 tooltip，清理临时状态，按 Registry 生命周期切换；焦点留在激活按钮；连续点击按触发顺序同步可观察 |
| `workbench.mode.toggle` | details/summary click、Enter、Space | `open` 与 `aria-expanded` 同步；外部 click 和 Escape 关闭 |
| `workbench.controls.toggle` | Panel toggle click | 保持滚动容器和已展开参数组状态；隐藏 tooltip |
| `entry.sidebar.toggle` | icon button click | 展开后 120ms 将焦点移到搜索框；折叠后焦点保留在按钮 |
| `entry.search.submit` | Search click 或输入框 Enter | Shift+Enter 不提交；搜索失败显示现有状态，不清除已有选择 |
| `entry.place.select` | 动态结果按钮 click/键盘 | 更新地图焦点与选择，不绕过 Tile 合同 |
| `entry.map.fit/focusSelection/zoomIn/zoomOut/panZoom` | 地图按钮、pointer、wheel、keyboard | Leaflet 保持唯一 Map 实例；无选择时 focusSelection 是 no-op |
| `entry.tile.select/toggle` | 地图 Tile 或列表 checkbox | 地图和列表保持同一选择源，Tile 次序稳定 |
| `entry.scene.enter` | 主按钮 click | 清除 picking，进入 busy；成功进入 Viewer，失败恢复并弹出错误 Dialog |
| `entry.scene.open/return` | quick bar/返回按钮 | 切换 Entry 与 Scene，不重建已加载 Viewer |
| `results.dock.toggle` | Result header click/键盘 | expanded、reserve、内部滚动和结果选择保持一致 |
| `performance.*` | Dock、模式、checkbox、类别按钮和动态类别 checkbox | 同步 Viewer 模式；`performance.category.toggle` 只更新对应场景类别，不改变 Feature 状态或结果 |
| `dialog.*` | primary/secondary/close/backdrop/Escape | 保持 focus trap；关闭后将焦点还给打开者；异步动作不得重复提交 |
| `loading.cancel` | Cancel click | 仅取消当前可取消任务；隐藏前清理 busy 与 progress 状态 |
| `parameter.tooltip.inspect` | 参数 hover/focus/Escape | hover 与 focus 信息一致；离开、失焦、Escape、scroll 或 resize 时关闭，不移动焦点 |

## 3. 共享 Solver 与 Viewer 命令

| 命令 | 输入 | 合同 |
| --- | --- | --- |
| `solver.configuration.update` | `{controlId, value}` | 发布对应 setting，失效相关结果并重绘；保持现有数值解析和默认值 |
| `device.position.update` | `{targetId, axis, value}` | 更新当前 Feature 设备位置；禁止写入非激活 Feature |
| `<feature>.device.pickTx/pickRx` | picking button 或 Canvas pointer | 再次触发关闭；Escape 取消；成功后同步 precision 字段和场景 |
| `viewer.device.pick` | Canvas pointerdown/up | 超过拖动阈值时不执行 pick；Pointer Capture 必须释放 |
| `viewer.camera.navigate` | pointer/wheel/keyboard | 只修改 Camera/Controls；不得触发字段或结果 Command |
| `viewer.txOrbit.toggle` | Orbit button | 保持 pressed/active 状态；Feature 切换、picking 或 Escape 时停止 |
| `workbench.group.toggle` | details/summary | 原生键盘语义；展开状态不因无关渲染重置 |
| `workbench.transient.dismiss` | 外部 click 或 Escape | 关闭 Mode menu、tooltip 和 Feature 临时 UI，不取消已提交 Job |

## 4. Feature 命令

| Feature | 配置命令 | 运行与结果命令 |
| --- | --- | --- |
| Link | `link.configuration.update`、`link.configuration.syncDerived` | `link.solve.run`、`link.path.select` |
| Mobility | `mobility.configuration.update`、`mobility.waypoint.addCurrentRx/select/remove/deleteSelected/clear` | `mobility.solve.run`、`mobility.playback.toggle/speed.change`、`mobility.timeline.seek/metric.change/inspect` |
| Radio Map | `radiomap.configuration.update` | `radiomap.solve.run`；领域 colormap 由 Feature palette 管理 |
| DeepMIMO | `deepmimo.configuration.update`、`deepmimo.roi.pick/clear` | `deepmimo.export.run`、`deepmimo.datasets.toggle`、`deepmimo.dataset.cancel/download` |
| Radar | `radar.configuration.update`、`radar.asset.previous/next`、`radar.target.add/select/pick/focus/remove` | `radar.solve.run`、`radar.job.cancel/retry`、`radar.processing.select`、`radar.rangeDoppler.scope.select/select`、`radar.detections.filter/toggleAll/select`、`radar.truth.select`、`radar.path.select`、`radar.paths.displayMode.change` |

## 5. 鼠标、键盘与焦点

- 原生 button、input、select、details/summary 行为是最低合同，组件不得用 div 模拟。
- Tab 顺序继续跟随冻结 DOM 顺序；隐藏子树不可获得焦点。
- Enter/Space 激活按钮和 summary；方向键保留原生 radio、range、select 行为。
- Escape 的优先级为：当前 Dialog/Tooltip/Mode/Feature transient -> Picking/precision -> Viewer movement。
- hover-only 信息必须同时可由 focus 获得；tooltip 关闭不得移动焦点。
- 动态 ListCard 选中后保留清晰 selected 状态；刷新列表时尽可能恢复同一业务 ID 的焦点。

## 6. 异步、取消和重试

1. 提交时记录 Feature、scene generation 和请求身份；旧响应不得覆盖新状态。
2. busy 期间禁止重复提交，但 Cancel 和允许的导航仍可操作。
3. Cancel 必须进入明确 terminal 状态并停止轮询；不得伪装为 error。
4. Retry 使用当前表单快照重新提交，不能复用已失效的请求对象。
5. Feature 切换期间 Job 可以按现有领域规则继续或取消，但回调只能更新其所有者状态。
6. 所有 timer、listener、subscription 和 pending animation 在 `dispose()` 释放。

## 7. 机器覆盖

浏览器测试从实际页面生成 363 个带 ID 元素的合同。所有 button、input、select、textarea、details 和 summary 必须含命名 `interaction.command`；动态列表、Leaflet、Canvas、Viewer 和全局 dismiss 操作登记在 `dynamicInteractions`。新增可操作控件若没有 Command，合同生成会失败。
