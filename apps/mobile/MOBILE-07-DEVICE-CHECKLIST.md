# MOBILE-07 — Android 真机验收清单（WANLAN AI 商家端）

- 阶段：PHASE MOBILE-07（发布与真机交付准备）
- App：`@wanlan/mobile` v0.1.0 · Expo SDK 57 · package `top.wanwan.wanlan.mobile`
- 生产 API：`https://api.wan-wan.top`（`expo.extra.apiBaseUrl`，无 localhost、无测试 JWT）
- **本清单只能在真机（或带 Google Play 服务的模拟器）上完成；服务器无法执行。**
- 结果列只允许：`PASS` / `FAIL` / `NOT_TESTED`（本次交付前均为 `NOT_TESTED`）

---

## 0. 先决条件：如何拿到安装包

当前交付环境（生产服务器 1 CPU、无 Java/Android SDK、无 EAS 凭证）**无法产出 APK/AAB**，因此安装包需在开发机执行下列任一方式生成。

### 方式 A：EAS 云构建（推荐）

```bash
# 一次性准备
npm i -g eas-cli          # 或使用脚本中已配好的 npx eas-cli@latest
eas login                 # 需要 Expo 账号
cd apps/mobile

# 内测 APK（发给测试同学，可直接安装）
npx eas-cli@latest build --platform android --profile preview

# 生产包（AAB，用于 Google Play）
npx eas-cli@latest build --platform android --profile production

# 开发版（含 dev client，需先安装 dev-client 依赖）
npx expo install expo-dev-client
npx eas-cli@latest build --platform android --profile development
```

构建完成后从 EAS 控制台下载 `*.apk`（preview）或 `*.aab`（production），或使用：
`npx eas-cli@latest build:list` 查看，`npx eas-cli@latest build:download --platform android --latest`

### 方式 B：本地构建（需 Android SDK + JDK 17）

```bash
cd apps/mobile
npx expo prebuild --platform android      # 生成 android/ 原生工程（会写入本地，属产物目录，不入库）
cd android && ./gradlew assembleRelease   # 产物：app/build/outputs/apk/release/app-release.apk
```

### 安装到真机

```bash
adb install -r app-release.apk            # 或把 apk 传到手机点击安装（需允许未知来源）
```

> 说明：`eas.json` 已配置 `development`（dev client + APK）/ `preview`（内测 APK）/ `production`（AAB，`autoIncrement` 自动递增版本号）；版本号来源为 **local**（app.json 为准：`version 0.1.0`、`versionCode 1`、`buildNumber 1`）。

### 测试账号要求

- 使用**真实商家账号**登录（`OWNER` / `ADMIN` / `OPERATOR` 之一，用于完整数据可见）。
- 另建议用一个 `CUSTOMER_SERVICE` 账号复测第 11、16、17、18 项的**金额/权限**表现。
- **不得**在生产库创建测试账号或测试订单数据。

---

## 1. 安装与启动

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 安装 | `adb install -r app-release.apk` | 安装成功，无解析错误；图标为 WANLAN 品牌图标（深色底 + 渐变 W 标） | NOT_TESTED | 图标来自 `/var/www/wanlan/assets/brand/wanlan-icon.svg` |
| 2 | 启动 | 点击图标启动 | 冷启动显示深色启动屏（背景 `#020817` + 居中品牌 logo），随后进入登录页或首页 | NOT_TESTED | 启动屏由 `expo-splash-screen` 插件提供 |

## 2. 认证与会话

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 3 | 登录 | 输入真实商家邮箱 + 密码，点「登录」 | 按钮出现 loading，成功后进入首页；失败给出安全文案（不显示原始报错） | NOT_TESTED | `POST /auth/login` |
| 4 | SecureStore token 保存 | 登录成功后**杀掉进程**再打开 App | 仍处于已登录状态，直接进入首页（无需重新登录） | NOT_TESTED | token 仅存 SecureStore（iOS Keychain / Android Keystore） |
| 20 | 退出登录 | 「我的」→「退出登录」 | 回到登录页；再次杀进程重开仍在登录页 | NOT_TESTED | `clearSession()` + 会话广播 |
| 21 | 401 回登录 | 让 token 失效（后台把该账号密码改掉或等 token 过期后再操作任意页面） | 任意请求收到 401 → 自动清会话 → 回登录页，且提示「登录状态已失效」 | NOT_TESTED | 全局 axios 拦截器 |

## 3. 首页（真实经营数据）

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 5 | 首页真实数据 | 登录后停在首页 | 显示今日成交额 / 订单数 / 支付订单数 / 新增客户 / 待处理人工接待 / 库存预警；数值与 Dashboard 同口径一致 | NOT_TESTED | `GET /m/home?sections=overview,inventory` |
| 5a | null 不冒充 0 | 找一个当日无订单的场景（或观察无数据卡片） | 无数据时显示「暂无数据」，**不得显示 0** | NOT_TESTED | 静态已验证：null → 「暂无数据」 |
| 24 | 下拉刷新 | 首页下拉 | 出现刷新指示，数据重新拉取；不会退回整屏骨架 | NOT_TESTED | 无定时轮询（已静态确认 setInterval=0） |
| 5b | 待人工入口 | 点首页「待处理人工接待」卡片 | 跳转待人工接待列表，列表条数与卡片数字一致 | NOT_TESTED | 口径：`needsHuman && resolvedAt=null` |

## 4. AI 员工

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 6 | AI 提问 | 「AI」Tab → 输入「今天店铺怎么样？」→ 发送 | 出现 loading 气泡 → 返回 answer + 数据依据 + 统计区间 | NOT_TESTED | `POST /agent/ask`（body 仅 `message`） |
| 7 | AI 快捷问题 | 点「今天订单怎么样？」/「最近销售趋势怎么样？」/「最近有什么异常？」 | 四个快捷问题均可点击并真实发起请求（不是纯文本） | NOT_TESTED | 已静态验证 4 条均在服务端快通道规则内 |
| 8 | AI loading | 发送后观察 | 输入框禁用、发送按钮转圈、快捷按钮置灰；**无伪造的流式打字效果** | NOT_TESTED | 后端无 SSE，采用普通 POST + loading |
| 9 | AI error | 断网或飞行模式下发送 | 显示安全错误文案 + 「重试」按钮；点重试可重发同一问题；**不显示假答案** | NOT_TESTED | 错误码 → 中文文案映射 |

## 5. 订单

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 10 | 订单列表 | 「订单」Tab | 显示真实订单（订单号 / 状态 / 客户脱敏名 / 金额 / 时间）；状态显示「处理中」等正确中文 | NOT_TESTED | `GET /m/orders`；生产真实状态为 Woo `processing` |
| 11 | 订单筛选 | 切换状态 chip + 日期区间（默认/近 7/近 30/近 90 天） | 列表按条件刷新；无结果时显示「没有符合条件的订单」 | NOT_TESTED | 状态筛选项受后端枚举限制 |
| 12 | 订单分页 | 列表滑到底 | 自动加载下一页，底部出现 loading；到底显示「已显示全部」 | NOT_TESTED | `limit=20` |
| 13 | 订单详情 | 点任一订单行 | 进入详情：订单号/状态/脱敏客户名/时间/金额 + **商品明细**（名称、SKU、数量、金额） | NOT_TESTED | `GET /m/orders/:orderNo`；items 来自订单真实字段 |
| 13a | 金额权限 | 用 `CUSTOMER_SERVICE` 账号看订单与详情 | 金额位置显示「金额不可见」，明细金额显示「不可见」；**不得显示 0** | NOT_TESTED | 服务端按角色裁剪字段 |

## 6. 商品与库存

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 14 | 商品 | 「商品」Tab →「商品」分段 | 显示真实商品列表（名称 / SKU 或「无 SKU」/ 库存或「暂无数据」/ 状态）；下拉刷新可用 | NOT_TESTED | `GET /m/products`（`isDeleted=false`、已分页） |
| 15 | 库存 | 切到「库存预警」分段 | 显示低库存数 / 缺货数 / 阈值 + 两类商品清单；无异常时显示「当前没有需要补货的商品」 | NOT_TESTED | `GET /m/inventory`；空数组为合法空状态 |

## 7. 客户

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 16 | 客户列表 | 「我的」→「客户」 | 列表显示**脱敏**姓名（如「测****」）、脱敏手机/邮箱、订单数；支持搜索与分页 | NOT_TESTED | `GET /m/customers`；PII 全部脱敏 |
| 17 | 客户详情 | 点任一客户 | 显示脱敏联系方式、来源、订单数/会话数/待人工数、最近订单金额与时间 | NOT_TESTED | `GET /m/customers/:id` |
| 17a | 金额权限 | 用 `CUSTOMER_SERVICE` 账号看客户详情 | 「最近订单金额」显示「金额不可见」 | NOT_TESTED | 服务端裁剪 |
| 18 | 客户订单 | 客户详情 → 最近订单区 | 有订单时可点进订单详情；无订单时显示「该客户暂无订单记录」 | NOT_TESTED | `GET /m/customers/:id/orders`（生产库 customerId 多为空，可能显示为空列表，属数据现状） |

## 8. 待人工接待 / 通知（只读）

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 19 | 待人工 | 「我的」→「待人工接待」 | 列表显示脱敏客户名 / 渠道 / 转人工原因 / 最后消息预览；支持分页与下拉刷新；页面明确标注只读 | NOT_TESTED | `GET /m/handoff`；**无回复/处理按钮**（本阶段不做） |
| 19a | 通知 | 「我的」→「通知」 | 显示系统操作记录（标题 / 资源 / 成功失败 / 时间）；页面说明「来源：系统操作记录」 | NOT_TESTED | `GET /m/notifications`（数据源为审计日志，无已读状态） |

## 9. UI 细节与系统适配

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 22 | 刘海 / 底部指示条 | 在刘海屏与手势导航机型上逐页查看 | 顶部标题不被刘海遮挡；底部 Tab 不被 Home Indicator 覆盖；输入框完整可见 | NOT_TESTED | 已静态确认各页使用 `useSafeAreaInsets` |
| 23 | 键盘遮挡 | AI 页 / 登录页 / 订单搜索框唤起键盘 | 输入框随键盘上移，不被遮挡；键盘弹出时仍可点击快捷问题 | NOT_TESTED | `KeyboardAvoidingView` + `keyboardShouldPersistTaps` |
| 24a | 滚动 | 各列表页快速上下滑 | 滚动流畅；长文本截断合理（`numberOfLines`） | NOT_TESTED | — |
| 25 | 网络断开恢复 | 开飞行模式 → 打开任意页面 → 关飞行模式 → 下拉刷新 | 断网时显示安全错误文案 + 「重新加载」；恢复网络后可正常刷新出数据 | NOT_TESTED | 不崩溃、不显示假数据 |

---

## NOT_TESTED 汇总（本阶段静态可验证 vs 必须真机）

| 类别 | 已在交付环境完成 | 只能真机完成 |
|---|---|---|
| 配置 | app.json 全部发布字段 / eas.json 三套 profile / Expo 配置解析 EXIT=0 | 原生构建是否成功 |
| 类型 | `pnpm typecheck` 0 错误（strict） | — |
| 打包 | `expo export --platform android` JS bundle 成功（**非 APK**） | APK/AAB 产出与安装 |
| 安全 | 无硬编码 JWT、token 仅 SecureStore、0 个 `.env`、无 mock | 运行期是否把 token 写入日志/崩溃上报 |
| UI | 13 页 Safe Area / 滚动 / loading / error / empty / 主题 静态矩阵 | 键盘遮挡、刘海适配、滚动手感 |
| 功能 | 端点契约与真实数据（后端侧已用生产库只读验证） | 全部交互路径（本清单 25 项） |

---

## iOS 后续要求（本阶段不做）

1. **Apple 开发者账号**（`top.wanwan.wanlan.mobile` 需在 App Store Connect 建立 App 记录）。
2. **证书与描述文件**：由 EAS 管理（`eas credentials`）或手动上传 Distribution Certificate + Provisioning Profile。
3. **iOS 构建**：`npx eas-cli@latest build --platform ios --profile production`（需 macOS 或 EAS 云构建；本阶段服务器无 macOS/无 Java，无法构建）。
4. **App Store 审核材料**：隐私清单（Privacy Manifest）、数据收集声明（当前会采集账号邮箱/昵称与设备凭证）、截图（6.7"/6.1"/12.9"）、应用描述、关键词。
5. **`ITSAppUsesNonExemptEncryption=false`** 已写入 `ios.infoPlist`，用于跳过出口合规问询。
6. **TestFlight**：内测需先通过 App Store Connect 审核；建议 Android 先跑通再启动 iOS。
7. iOS 上 SecureStore 使用 Keychain（`WHEN_UNLOCKED_THIS_DEVICE_ONLY`）—— 需真机确认卸载重装后会话被清除。

---

## 后续 Backlog（本阶段明确不做）

| 项 | 说明 |
|---|---|
| handoff reply / resolve | 待人工接待的**回复与标记处理**（写操作，需后端授权与审计） |
| notification read / unread | 真实通知实体与已读状态（当前数据源为审计日志，`read` 为假字段，已剔除） |
| 多币种后端重构 | `/m/home` 的 GMV 未按 currency 分组（当前生产仅 USD）；客户端已去掉货币符号并标注 |
| Woo `customerId` 数据修复 | 生产订单 `customerId` 为空导致「客户 → 订单」链路实际无数据 |
| AI streaming | 需后端提供 SSE/ReadableStream；现为普通 POST + loading |
| 语音输入 | AI 页未实现 |
| 推送通知 | 未接入（无 Expo Push Token / 无服务端推送） |
| 新业务模块 | 本阶段不新增 |

---

## 验收判定

- **可进入内测**：第 1–5、10、14、16、20 项全部 PASS，且第 22、23 项无阻断性问题。
- **可进入正式发布**：全部 25 项 PASS，且 `CUSTOMER_SERVICE` 账号在 11、13a、17a 上无金额泄漏。
- 任一 `FAIL` 需记录机型 / Android 版本 / 复现步骤 / 截图，并在修复后重新验证该项及其相邻项。
