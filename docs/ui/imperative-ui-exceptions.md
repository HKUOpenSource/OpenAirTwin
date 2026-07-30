# 命令式 UI 与 Inline Runtime Style 例外

机器可读清单位于 [imperative-ui-exceptions.json](imperative-ui-exceptions.json)。清单是 allowlist，不是推荐 API；新增文件或操作必须先说明唯一所有者、理由、清理路径和删除条件。

## 允许边界

| 类别 | 所有者 | 允许原因 | 生命周期/删除条件 |
| --- | --- | --- | --- |
| Legacy DOM ref 与 Feature template bridge | `shell:feature-registry` | 当前原生工作台启动和 Radar 模板挂载所需 | 对应 React 子树切换所有权后删除；`dispose()` 清理 |
| Leaflet Entry Map | `shell:entry-map` | Leaflet 必须命令式管理 Pane、Marker、Tooltip 和 Map host | React 只拥有 host；Map adapter dispose 清理 |
| Three.js Viewer 与 picking | `shell:viewer` | WebGL Canvas、Controls、Pointer Capture 和 Scene graph 是命令式引擎 | React 只拥有稳定 Canvas host；Viewer dispose 清理 |
| Canvas/SVG 图表 | 各 Feature | 像素绘制、crosshair 和 tooltip 坐标由图表布局实时计算 | Chart adapter dispose；迁移后仍可保留受控 host |
| Radar 3D 标签/connector | `feature:radar` | 标签投影、遮挡、缩放、颜色和连接线逐帧变化 | Feature deactivate/dispose 删除 layer 和 frame listener |
| 动态结果/列表 renderer | 各 Feature | Phase 5 前仍由 Legacy View 创建结果行 | 对应 React 结果边界接管时删除 |
| 动态几何 style | Shell/Feature owner | left/top/width/transform、reserve、进度和领域色板属于运行时输入 | 仅允许清单中的文件；静态设计值必须使用 CSS Token |

## Runtime Style 分类

- 布局坐标：tooltip、Radar label/crosshair、Canvas tooltip。
- 进度与显隐兼容：Loading、Legacy result section、Entry/Scene bridge。
- 动态 reserve：`--analysis-dock-bottom-reserve`。
- 领域数据色：Radio Map gradient、Radar target/detection/clutter palette。
- 引擎属性：Leaflet pane z-index/pointer-events、Viewer cursor。

禁止通过 inline style 写入静态颜色、间距、字号、圆角、阴影、控件高度或任意 z-index。Leaflet pane z-index 是第三方引擎配置例外，不是设计系统层级。
