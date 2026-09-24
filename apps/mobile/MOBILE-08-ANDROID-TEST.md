# MOBILE-08 — Android 真机测试清单（WANLAN AI 商家端）

- 阶段：PHASE MOBILE-08（Android 可安装包构建准备）
- App：`@wanlan/mobile` v0.1.0 · Expo SDK 57 · package `top.wanwan.wanlan.mobile` · versionCode `1`
- API：`https://api.wan-wan.top`（固定生产地址，无 localhost、无测试 JWT）
- **结果列只允许 `PASS` / `FAIL` / `NOT_TESTED`。禁止伪造结果。**
- 本文件交付时 20 项全部为 `NOT_TESTED`（构建与安装须在开发机 + 真机完成）

---

## 0. 在开发机生成 APK（服务器无凭证，不在此构建）

```bash
# 1) 一次性：登录 Expo（服务器上**未登录**，且本阶段不创建任何 token）
npm i -g eas-cli          # 或用下方的 npx 形式
eas login                 # 输入 Expo 账号（凭据只存在你自己机器）

# 2) 进入工程
cd apps/mobile

# 3) 生成可安装 APK（preview profile → buildType: apk）
npx eas-cli@latest build --platform android --profile preview

#    构建完成后从终端/控制台下载 .apk，或：
npx eas-cli@latest build:list --platform android --limit 1
npx eas-cli@latest build:download --platform android --latest

# 4) 生产包（AAB，用于 Google Play；versionCode 自动 +1）
npx eas-cli@latest build --platform android --profile production
```

> - `preview` → **APK**（internal distribution，可直接安装）
> - `production` → **AAB**（`autoIncrement: true`，会写回 `app.json` 的 `versionCode`）
> - `development` profile 需要先 `npx expo install expo-dev-client`（本阶段**不需要**，因为要的是可独立安装的 APK）

### 安装到真机

```bash
adb install -r <下载的>.apk
# 或：把 .apk 传到手机 → 文件管理器中点击安装 → 允许「安装未知应用」
```

### 记录本次测试环境（每次测试都填）

| 项 | 值 |
|---|---|
| 机型 | |
| Android 版本 | |
| APK 文件名 / EAS build ID | |
| versionCode | 1 |
| 测试账号角色（OWNER / ADMIN / OPERATOR / CUSTOMER_SERVICE） | |
| 测试时间 | |

---

## 1. 功能验证（20 项）

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 1 | **APK 安装** | `adb install -r xxx.apk` 或点击安装 | 安装成功无解析错误；桌面图标为 WANLAN 品牌图标（深色底 + 渐变 W 标），名称「万澜 WANLAN AI」 | NOT_TESTED | 图标由品牌 SVG 生成 |
| 2 | **首次启动** | 点击图标 | 先显示深色启动屏（#020817 + 居中 logo），随后进入**登录页**（无会话时）；无白屏、无闪退 | NOT_TESTED | splash 由 expo-splash-screen 提供 |
| 3 | **登录** | 输入真实商家账号 → 点登录 | 按钮转圈 → 成功进入首页；账号或密码错误时显示「邮箱或密码不正确」类安全文案（不回显原始报错/状态码） | NOT_TESTED | `POST /auth/login` |
| 4 | **首页** | 停在首页 | 显示今日成交额/订单数/支付订单数/新增客户/待处理人工接待/库存预警；**数值与 Dashboard 一致**；无数据处显示「暂无数据」而**不是 0** | NOT_TESTED | `GET /m/home?sections=overview,inventory` |
| 5 | **AI** | 「AI」Tab → 输入问题 → 发送；再点 4 个快捷问题 | 出现加载态 → 返回回答 + 数据依据 + 统计区间；快捷问题真实发起请求（非静态文案）；失败时显示安全错误 + 可重试，**不出现假答案** | NOT_TESTED | `POST /agent/ask`（body 仅 message） |
| 6 | **订单** | 「订单」Tab → 切换状态筛选 → 上滑到底 | 显示真实订单（单号/状态中文/脱敏客户名/金额/时间）；筛选后列表刷新；滑到底自动加载下一页，到底显示「已显示全部」 | NOT_TESTED | `GET /m/orders`（limit 20） |
| 7 | **订单详情** | 点任一订单 | 订单号、状态、脱敏客户、时间、金额 + **商品明细**（名称/SKU/数量/金额）；返回可回列表 | NOT_TESTED | `GET /m/orders/:orderNo` |
| 8 | **商品** | 「商品」Tab → 「商品」分段 | 真实商品列表（名称/SKU 或「无 SKU」/库存或「暂无数据」/状态）；下拉刷新可用 | NOT_TESTED | `GET /m/products` |
| 9 | **库存** | 切到「库存预警」分段 | 显示低库存数/缺货数/阈值 + 两类清单；无异常时显示「当前没有需要补货的商品」 | NOT_TESTED | `GET /m/inventory` |
| 10 | **客户** | 「我的」→「客户」 | 列表显示**脱敏**姓名/手机/邮箱 + 订单数；搜索与分页可用 | NOT_TESTED | `GET /m/customers`（PII 全脱敏） |
| 11 | **客户详情** | 点任一客户 | 显示脱敏联系方式、来源、订单数/会话数/待人工数、最近订单金额与时间 | NOT_TESTED | `GET /m/customers/:id` |
| 12 | **待人工** | 「我的」→「待人工接待」 | 列表显示脱敏客户名/渠道/转人工原因/最后消息预览；可下拉刷新与分页；页面明确标注**只读**（无回复/处理按钮） | NOT_TESTED | `GET /m/handoff` |
| 13 | **通知** | 「我的」→「通知」 | 显示系统操作记录（标题/资源/成功失败/时间）；页面说明来源为系统操作记录 | NOT_TESTED | `GET /m/notifications` |
| 14 | **我的** | 「我的」Tab | 顶部显示当前账号信息（沿用 SecureStore 中的真实字段，缺失则显示通用文案）；入口可用；顶部不被状态栏遮挡 | NOT_TESTED | 无虚构店铺名 |
| 15 | **退出登录** | 我的 → 退出登录 | 回到登录页；**杀掉进程重开仍在登录页**（会话已清） | NOT_TESTED | 清 SecureStore + 广播 |
| 16 | **401 处理** | 使 token 失效（后台改密或等过期）→ 操作任意页面 | 收到 401 后自动清会话并回登录页，提示「登录状态已失效」；**不显示空白死界面** | NOT_TESTED | 全局 axios 拦截器 |
| 17 | **键盘** | AI 页 / 登录页 / 客户搜索框唤起键盘 | 输入框随键盘上移不被遮挡；键盘弹出时快捷问题/按钮仍可点；收起键盘布局复位 | NOT_TESTED | KeyboardAvoidingView + keyboardShouldPersistTaps |
| 18 | **刘海 / 底部指示条** | 刘海屏 + 手势导航机型逐页查看 | 顶部标题与内容不被刘海遮挡；底部 Tab 不被 Home Indicator 覆盖；四角内容完整可见 | NOT_TESTED | 13 页均已用 useSafeAreaInsets |
| 19 | **下拉刷新** | 首页/订单/商品/库存/客户/待人工/通知 各下拉 | 出现刷新指示；数据重新拉取；**不退回整屏骨架**；失败保留旧数据 + 错误条 | NOT_TESTED | 无定时轮询 |
| 20 | **网络断开恢复** | 开飞行模式 → 打开任意页面 → 关飞行模式 → 下拉刷新 | 断网时显示安全错误文案 + 「重新加载」；恢复网络后可正常刷新出数据；**不崩溃、不显示假数据** | NOT_TESTED | — |

---

## 2. 结果汇总（测试完成后填写）

| 结果 | 数量 |
|---|---|
| PASS | 0 |
| FAIL | 0 |
| NOT_TESTED | 20 |

**FAIL 上报格式**（缺一不可）：

```text
编号：              例 #19
机型 / Android 版本：
APK 文件名 / build ID：
复现步骤：
实际结果：
期望结果：
截图 / 录屏：
是否必现：
```

---

## 3. 本阶段已在服务器完成的门禁（静态，非真机）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ EXIT=0（strict + noUncheckedIndexedAccess，0 error） |
| `npx expo config --type public --json` | ✅ EXIT=0 |
| API = `https://api.wan-wan.top` | ✅ |
| Android package / iOS bundleIdentifier | ✅ `top.wanwan.wanlan.mobile` |
| version / versionCode / buildNumber | ✅ `0.1.0` / `1` / `1` |
| icon / adaptiveIcon / splash 文件存在 | ✅ 三者在 `assets/` 且被 app.json 正确引用 |
| 源码 mock / faker / dummy | ✅ 0 |
| 源码 localhost / 127.0.0.1 | ✅ 0 |
| 硬编码 JWT / Bearer 字面量 | ✅ 0 |
| 日志打印 token / secret / password | ✅ 0 |
| `.env` 文件 | ✅ 0（mobile 工程内无任何 .env） |
| token 存储 | ✅ 仅 SecureStore（25 处）；AsyncStorage/localStorage 仅出现在**注释**中（声明禁止使用） |
| `expo export --platform android`（MOBILE-07 已执行） | ✅ EXIT=0，产物 `dist/`（Hermes bundle 2.9MB + 27 资源） |

> 注意：`expo export` 产物**不是可安装 APK**，仅证明生产打包链路可用；APK 必须由 EAS 或本地 Android SDK 生成。

---

## 4. APK 未在本机生成的原因（如实记录）

| 依赖 | 状态 |
|---|---|
| EAS 登录 | ❌ **未登录**（`~/.expo/state.json` 仅含 `uuid`，无 auth；`~/.eas` 不存在） |
| `EXPO_TOKEN` / `EXPO_ACCESS_TOKEN` | ❌ 均未设置 |
| eas-cli | ❌ 未全局安装（可用 `npx eas-cli@latest`，需先登录） |
| Java (JDK 17) | ❌ 未安装 |
| Android SDK / `ANDROID_HOME` | ❌ 未设置 |
| `adb` | ❌ 未安装 |
| 真机 / 模拟器 | ❌ 无 |

**决策（遵嘱）**：不在 1 CPU 生产服务器安装 JDK/Android SDK，也不做本地 Gradle 构建；全部构建步骤在开发机执行（见第 0 节）。

---

## 5. 未完成事项（后续）

1. 开发机执行 `eas login` → `npx eas-cli@latest build --platform android --profile preview` → 产出 APK。
2. 真机跑完第 1 节 20 项，回填结果与 FAIL 细节。
3. `production` profile 的 AAB 在准备提交 Google Play 时再构建（会自增 versionCode）。
4. iOS：需 Apple 开发者账号 + App Store Connect 记录 + 证书/描述文件（可在 macOS 或 EAS 云构建）。
5. 依赖偏斜（留待开发机专项处理，本阶段不动）：`react-native-worklets` 0.12.2 vs `expo-modules-core` 期望 `^0.7–^0.10`；`@react-native/metro-config` 0.87.1 vs `@react-native/community-cli-plugin` 0.86.3。
