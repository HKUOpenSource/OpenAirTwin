# OpenAirTwin UI Legacy Alias 退役记录

> 状态：Phase 8 已完成；生产代码不存在活动 Legacy Alias

Phase 8 已删除 `.btn`、`.miniBtn`、`.miniSelect`、`.primary`、`.danger` 和 `oat-button--legacy-native-font`。这些名称仅保留在本退役记录和构建拒绝清单中，不能重新进入 CSS、React 标记、组件清单或 Feature 实现。

新 UI 必须使用 `component-manifest.json` 中登记的 `oat-*` 公共类。需要新 Variant 时，先更新组件合同、机器清单、组件目录和测试，不允许用 Alias 或 Feature 私有类复制公共组件几何。
