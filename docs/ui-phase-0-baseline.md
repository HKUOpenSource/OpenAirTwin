# OpenAirTwin UI Phase 0 基线

> 状态：已冻结
> 日期：2026-07-30
> 适用范围：核心桌面工作台
> 视觉参考：`1440x900`
> 最小支持视口：`1280x720`

## 1. 基线目的

本基线用于保护后续组件标准化和 React 迁移。它记录当前可发布工作台的 DOM、样式、网络、资源和视觉行为，使后续迁移可以证明“实现发生变化，但功能、操作逻辑、视觉效果和样式没有变化”。

基线不是新的设计稿，也不是允许更新视觉差异的理由。除非任务本身明确批准了产品可见变化，否则基线差异必须先作为回归处理。

## 2. 已冻结的证据

### 2.1 机器可比较合同

以下文件由 Playwright 的确定性工作台 Fixture 生成并在普通测试中严格比较：

- `tests/browser/baselines/phase-0-dom-contract.json`
  - 按文档顺序记录全部带 ID 的节点；
  - 记录 Tag、Class、Role、ARIA、模式数据、Label、默认值、Checked、Disabled 和 Details Open 状态；
  - 用于保护现有 DOM ID、可访问性关系、控件顺序和默认状态。
- `tests/browser/baselines/phase-0-computed-styles.json`
  - 记录全部 `--oat-*` Token 的浏览器最终值；
  - 记录 Panel、Button、Input、Checkbox、Badge、折叠组、Scroll Region、Device Dock、Result Dock、Performance Dock、Dialog、Entry Panel 和 Radar Field 的代表 computed style；
  - 用于发现 Cascade、Token、字体、边框、间距、尺寸、滚动和层级漂移。
- `tests/browser/baselines/phase-0-network-contract.json`
  - 记录首次场景初始化加载的第一方 CSS、JS、Library 和关键 UI Asset；
  - 记录 Path、Status、Resource Type、Content Type 和 Content Length；
  - 用于发现缺失资源、意外依赖和未审查的传输增长。
- `tests/browser/baselines/phase-0-resource-contract.json`
  - 预热全部五个 Feature 后连续执行五轮模式循环；
  - 要求 Active Interval、Canvas、DOM Node、Frame Listener、Listener Registration 和 Radar Label Element 的增长全部为 0。

### 2.2 运行环境观测

`tests/browser/baselines/phase-0-runtime-observation.json` 保存一次基线环境观测，不作为逐字节性能断言：

- Playwright Browser：Chromium；
- Browser UA：Headless Chrome 146；
- 平台：macOS / MacIntel；
- 视口：`1440x900`；
- UI Ready Wall Time：152 ms；
- DOM Complete：90.4 ms；
- First Contentful Paint：768 ms；
- Resource Count：101；
- Encoded Body：18,133,972 bytes；
- Transfer：18,163,672 bytes；
- 五轮 Feature 循环前后：1 个 Active Interval、4 个 Canvas、1,396 个 DOM Node、274 次 Listener Registration，均无增长。

这些时间和 Heap 数据会受到设备、Browser Build、缓存和测试调度影响。Phase 3 建立构建性能预算时，应在相同环境重复采样并使用中位数，不能把单次观测直接作为跨机器硬阈值。

### 2.3 视觉快照

新增：

- `workbench-shell-1440-darwin.png`：展开 Performance Dock 的完整 `1440x900` 工作台；
- `workbench-shell-1280-darwin.png`：默认折叠 Performance Dock 的完整 `1280x720` 工作台；
- `performance-dock-expanded-darwin.png`：展开状态的 Performance Dock 组件。

继续保留且未更新：

- Link、Mobility、Radio Map、DeepMIMO 和 Radar 五个控制栏快照；
- Radar Result Dock 快照；
- Radar Target Label 快照。

完整工作台快照使用稳定 Viewer Stub，避免持续 WebGL Frame 的亚像素噪声覆盖 UI 回归信号。真实 Viewer、WebGL、Asset、Layer、Radar Target 与 Canvas Chart 仍由现有浏览器测试单独验证。

`1280x720` 整屏基线额外断言：

- Control Panel 与 Result Dock 不重叠；
- Control Panel 与 Device Dock 不重叠；
- Result Dock 与 Device Dock 不重叠；
- 默认折叠 Performance Dock 不与 Result/Device Dock 重叠；
- Device Dock 完整位于视口内。

## 3. 浏览器支持记录

Phase 0 保持当前已有支持范围，不扩大兼容承诺：

- 桌面 Chromium / Google Chrome；
- macOS 视觉快照由本机 Google Chrome/Chromium 路径执行；
- CI 使用 Playwright Chromium 执行非平台像素相关合同；
- 不支持小于 `1280x720` 的核心工作台；
- Firefox、Safari 和移动端不在本阶段发布合同中；
- 教程网站继续使用独立的响应式和浏览器测试体系。

## 4. 更新与审查规则

普通验证命令：

```bash
cd tests/browser
npx playwright test --grep "phase 0"
```

只有在明确审查基线变更时，才允许运行：

```bash
cd tests/browser
OAT_UPDATE_PHASE0_BASELINE=1 npx playwright test --grep "phase 0" --update-snapshots
```

更新前必须完成：

1. 说明为什么旧合同不再适用；
2. 检查 DOM ID、ARIA、默认值和控件顺序差异；
3. 检查 Token 与 computed style 差异；
4. 检查网络新增、删除和体积变化；
5. 用图像查看器人工检查每张新旧快照；
6. 确认资源增长仍为 0；
7. 在 PR 或阶段证据报告中列出全部有意差异；
8. 运行完整 Python 与 Playwright 测试，而不是只运行基线测试。

禁止仅因为 React、Vite、TypeScript、DOM Factory 或组件实现变化就更新基线。实现变化必须先证明产品合同等价；只有基础设施导致的已解释网络路径变化可以在对应迁移阶段单独审查。

## 5. Phase 0 完成门槛

- [x] 七文件 CSS 架构和 `--oat-*` Token 合同已建立。
- [x] `1440x900` 现有视觉快照未更新。
- [x] 新增 `1440x900` 与 `1280x720` 完整工作台快照。
- [x] DOM、computed style、网络和资源合同已版本化。
- [x] 五轮完整 Feature 切换资源增长为 0。
- [x] 浏览器支持范围已记录。
- [x] 完整 Python 测试通过：303 passed，4 skipped。
- [x] 完整 Playwright 测试通过：19 passed。
- [x] 应用内浏览器真实页面与交互验证通过，Console 无 warning/error。
- [x] 最终 Diff 审查通过并创建 Phase 0 提交。

Phase 0 的合同、验证证据与提交范围已完成最终核对。
