# ADR 0002：采用内部组件库，不采用带样式第三方组件框架

- 状态：已接受
- 日期：2026-07-30
- 决策范围：核心桌面工作台组件与样式

## 背景

OpenAirTwin 必须保持现有控件密度、DOM ID、元素语义、键盘/焦点行为、`1440x900` 像素基线和 `1280x720` 布局。MUI、Ant Design、Bootstrap 等带样式组件框架通常引入自己的 DOM 包装、尺寸、状态样式和主题层，会扩大等价验证成本。

## 决策

建设内部 OpenAirTwin 组件层，复用现有七个 CSS 模块、Cascade Layers 和 `--oat-*` Token。组件 API 只暴露语义 variant，不允许任意视觉值。公共组件合同以 `docs/ui/component-contracts.md` 为准。

默认不引入 headless 组件库。单个复杂组件只有在 DOM、ARIA、键盘、焦点、生命周期、bundle 和视觉等价均有测试证据时，才允许通过独立 ADR 引入。Lucide 等纯图标资产可在集中图标合同建立后单独评估，不属于组件框架授权。

## 后果

- 能严格复用现有视觉和行为，不产生第三方主题与 Token 双重事实来源。
- 团队需自行维护组件状态、可访问性、目录和测试矩阵。
- 新 Feature 必须先组合公共组件；领域组件不得覆盖公共核心几何。
- Phase 2 先在原生 UI 中证明组件合同，Phase 4 才实现 React 组件。

## 未采用方案

- 带样式组件框架：DOM 与视觉偏差风险高。
- Utility-first CSS 重写：会绕过当前 Token/Layer 归属并产生 class 级视觉 API。
- CSS-in-JS：增加运行时和样式注入顺序，破坏原生 CSS 合同。
