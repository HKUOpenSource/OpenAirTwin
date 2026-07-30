# OpenAirTwin 图标合同

> 状态：Phase 2 生效

图标由 `oat-icon` 和 `tokens.css` 中的 `--oat-icon-*` Token 统一管理。Feature 可以选择已登记尺寸，但不能重新定义通用 SVG 的 fill、stroke、端点或连接样式。

## 尺寸与描边

| 用途 | 尺寸 Token | 描边 Token |
| --- | --- | --- |
| 紧凑 Chevron | `--oat-icon-size-xs` / `--oat-icon-size-sm` | `--oat-icon-stroke-chevron` |
| 默认操作图标 | `--oat-icon-size-md` / `--oat-icon-size-base` | `--oat-icon-stroke-default` |
| 工具栏和导航图标 | `--oat-icon-size-lg` / `--oat-icon-size-xl` | `--oat-icon-stroke-medium` / `--oat-icon-stroke-strong` |
| 大型快捷操作 | `--oat-icon-size-2xl` | `--oat-icon-stroke-light` |

所有图标使用 `currentColor`，并保持 `fill:none`、圆形 linecap 和 linejoin。图标在按钮内必须位于稳定的居中容器中，不得改变按钮尺寸。

## 可访问性

- 纯图标按钮必须提供 `aria-label`，SVG 自身使用 `aria-hidden="true"`。
- 图标与可见文本同时出现时，SVG 使用 `aria-hidden="true"`，accessible name 由文本提供。
- 表达数据的图表 SVG 不属于装饰图标，继续使用 `role="img"` 和明确的 `aria-label`。
- 禁止只通过图标颜色表达 selected、error 或 busy 状态。
