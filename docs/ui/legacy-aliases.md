# OpenAirTwin UI Legacy Alias 退役规则

> 状态：Phase 6 生效；兼容类保留到统一清理阶段

Legacy Alias 仅用于保持现有 DOM 与视觉合同，不能成为新 UI 的依赖。新代码必须同时使用或只使用 `oat-*` 公共类。

| Alias | 公共合同 | 最迟删除阶段 | 删除条件 |
| --- | --- | --- | --- |
| `.btn` | `.oat-button` | Phase 7 | Shell 所有者迁移完成，产品 DOM 与快照通过 |
| `.miniBtn` | `.oat-button.oat-button--compact` | Phase 7 | 对应 Feature/Shell 所有者迁移完成 |
| `.miniSelect` | `.oat-input.oat-input--compact` | Phase 8 | Phase 0 DOM 合同退出兼容期，结果区与控件区可一起清理 |
| `.danger` | `.oat-button--danger` | Phase 7 | 所有危险操作迁移完成 |

`oat-button--legacy-native-font` 是仅用于 Phase 0 视觉等价的内部兼容类。它标记本轮才接入公共合同、但原先使用浏览器原生控件字体的五个 `miniBtn` 实例；不得用于新 UI，并随对应 Shell/Mobility 所有者在 Phase 7 前删除。

规则：

1. Alias 只能出现在 `components.css` 的共享 `:where()` 选择器中，不能拥有独立实现。
2. 生产 DOM 中出现 Alias 时必须同时出现对应 `oat-*` 类。
3. 不允许新增 Alias；需要新 Variant 时先更新 `component-manifest.json` 和组件目录。
4. 只有对应 UI 子树切换为单一 React 所有者、通过完整回归且 Phase 0 DOM 兼容期结束后，才能删除 Alias。
