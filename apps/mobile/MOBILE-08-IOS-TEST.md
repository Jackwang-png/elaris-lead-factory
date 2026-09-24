# MOBILE-08 — iOS 真机内测（EAS preview）+ iPhone 验收清单

- 阶段：PHASE MOBILE-08（iOS 真机 EAS 构建路线）
- App：`@wanlan/mobile` v0.1.0 · Expo SDK 57 · `ios.bundleIdentifier = top.wanwan.wanlan.mobile` · `ios.buildNumber = 1`
- API：`https://api.wan-wan.top`（固定生产地址；无 localhost、无测试 JWT、无 mock）
- 目标：产出可安装到**你本人 iPhone** 的 iOS 内测构建（`preview` profile），并完成 25 项真机验收
- **结果只允许 `PASS` / `FAIL` / `NOT_TESTED`。禁止根据代码推测 PASS。**
- 交付时 25 项全部为 `NOT_TESTED`

> 所有登录、签名、构建动作**只在你的 Windows 开发机执行**。
> 生产服务器不登录 Expo、不保存 Apple/Expo 长期凭证、不安装 Xcode/macOS 工具链、不改任何生产服务。

---

## 0. Apple Developer 前置条件（不满足则无法安装到真机）

| 前置 | 说明 |
|---|---|
| **Apple Developer Program（付费）** | **必需**。iOS 内测分发（ad-hoc）要求付费团队；免费 Apple ID 只能构建 **模拟器**包，**无法安装到真机**。年费约 ¥688/年，注册后需在 App Store Connect 同意最新协议。 |
| Apple ID 的团队角色 | 需为 **Admin** 或 **App Manager**，否则 EAS 无法创建证书/描述文件/App ID。 |
| Bundle ID | 复用现有 `top.wanwan.wanlan.mobile`（EAS 会注册该 ID 或复用已存在的 ID）。**不要另建冲突的新 ID。** |
| 设备注册 | ad-hoc 分发要求**先注册 iPhone 的 UDID**（每账号每年上限 100 台 iOS 设备）。 |
| UDID 注册后必须**重新构建** | 构建时会把已注册设备写入 provisioning profile；注册前构建的包在未注册设备上无法安装。 |

**若没有付费 Apple Developer 账号 → 立即停止 iOS 真机构建**，先完成注册，不要伪造构建成功。

---

## 1. Windows 开发机命令（严格按顺序）

```bat
:: ── 1. 进入工程 ────────────────────────────────────────────
cd D:\SmartCS\apps\mobile

:: ── 2. 环境检查 ────────────────────────────────────────────
node -v
pnpm -v
::  需 Node 20+（本工程实测通过 v20.20.2）、pnpm 10
::  若 node_modules 不存在，先在仓库根执行：cd D:\SmartCS && pnpm install

:: ── 3. 登录 Expo（由你本人在浏览器/终端完成） ───────────────
npx eas-cli@latest login

:: ── 4. 确认登录账号 ────────────────────────────────────────
npx eas-cli@latest whoami

:: ── 5. 初始化 EAS 项目（首次必须；会在 app.json 写入 extra.eas.projectId） ──
npx eas-cli@latest init
::  交互：Would you like to automatically create an EAS project? → Yes
::  它会写 app.json 的 extra.eas.projectId（+ 可能的 owner）。这是 EAS 必需项，
::  不属于「改 bundle identifier / 改 App 名称」。**不要选 commit。**

:: ── 6. 设备列表（刚初始化时应为空） ─────────────────────────
npx eas-cli@latest device:list

:: ── 7. 注册你的 iPhone（生成二维码/链接，用 iPhone 的 Safari 打开） ──
npx eas-cli@latest device:create
::  选择 Registration method → Website
::  iPhone 上用 **Safari** 打开该链接（不要用微信/Chrome 内置浏览器）：
::    → 允许下载配置描述文件 → 设置 → 通用 → VPN与设备管理 → 安装
::    → 输入锁屏密码后即可完成 UDID 注册
::  回到电脑后再次确认：
npx eas-cli@latest device:list
::  应能看到你的设备（名称 + 注册时间）。**看不到就不要开始 build。**

:: ── 8. 构建前门禁（任一失败即停止，不要改业务代码强行通过） ──
pnpm typecheck
npx expo config --type public --json
::  需确认：api = https://api.wan-wan.top / 无 localhost / 无 token / 无 mock /
::          bundleIdentifier = top.wanwan.wanlan.mobile / version 0.1.0 / buildNumber 1

:: ── 9. 构建 iOS 内测包（preview，不用 production） ──────────
npx eas-cli@latest build --platform ios --profile preview
```

### EAS 交互项：应该怎么选

| 提示 | 选择 | 说明 |
|---|---|---|
| Log in to your Apple account | 用你的 Apple ID 登录（浏览器授权 + 2FA） | 若 CLI 要求终端输入密码，可先在 [appleid.apple.com](https://appleid.apple.com) 生成 **App-Specific Password** 使用；**不要**把密码发到聊天里 |
| Select an Apple Team | 选你**付费的**团队 | 多团队时务必选带 Program 的那个 |
| Bundle identifier | **使用现有** `top.wanwan.wanlan.mobile`（Register/use existing） | **不要**让它生成新 ID |
| Generate a new Apple Distribution Certificate? | **Yes** | 由 EAS 生成并托管；**不会**下载私钥到你的项目或服务器 |
| Generate a new Apple Provisioning Profile? | **Yes**（Ad Hoc） | 会自动包含已注册设备 |
| iOS Distribution Certificate 已存在 → reuse? | 若提示复用现有证书，可选 **Yes（复用）** | 避免超出证书数量限制 |
| Would you like to commit changes? / staging | **No / 不提交** | 本阶段禁止 commit |
| Install expo-dev-client? | 仅 `development` profile 会问；本次是 `preview`，**不会**出现 | — |

**禁止**：下载私钥/证书到生产服务器、把证书或 profile 提交 Git、把密码写入源码、打印任何 secret。

---

## 2. 构建成功后的信息记录（回填）

| 项 | 值 |
|---|---|
| Build ID | |
| Build 状态 | |
| IPA / internal build 状态 | |
| Bundle ID | `top.wanwan.wanlan.mobile` |
| version | `0.1.0` |
| buildNumber | `1` |
| provisioning 类型 | Ad Hoc（internal distribution） |
| 注册设备数量 | |
| 安装链接 | |

### 如何拿到安装链接 / IPA

```bat
:: 列出构建（含 Build ID 与详情页链接）
npx eas-cli@latest build:list --platform ios --limit 3

:: 把最新 IPA 下载到开发机（可选）
npx eas-cli@latest build:download --platform ios --latest --output wanlan-ios.ipa
```

- CLI 完成后**不会**直接打印可点击的安装地址；它在最后给出 builds 详情页链接：
  `https://expo.dev/accounts/<你的账号>/projects/wanlan-mobile/builds/<build-id>`
- 打开该页面 → 右上 **Install** 按钮 → 展示二维码/安装链接（ad-hoc 分发）。
- **最佳实践**：直接在 **iPhone 的 Safari** 打开该详情页 → 点 Install。

---

## 3. iPhone 安装（**未执行，状态为 NOT_TESTED**）

```text
1. 用 iPhone 的 Safari 打开 EAS build detail 页面（或扫描页面上的二维码）
2. 点击 Install → 系统提示「要安装 "万澜 WANLAN AI"」→ 安装
3. 若提示企业级/开发者证书未受信任：
   设置 → 通用 → VPN与设备管理 → 信任该开发者（iPhone Distribution: …）→ 信任
4. iOS 16+ 说明：
   · ad-hoc（distribution 签名）构建**通常不需要开发者模式**；
   · 若安装或启动被系统拒绝，再开启 设置 → 隐私与安全性 → 开发者模式 → 重启 iPhone（iOS 16+ 必需）
   · development 签名的包（EAS development profile）在 iOS 16+ 一定需要开发者模式
5. 安装前后记录环境：
   iPhone 型号 / iOS 版本 / App version / buildNumber
```

> ⚠️ 未注册 UDID 的设备会看到「This app is not available for your device」——此时回到 §1 第 7 步注册后**重新构建**。

---

## 4. 真机验收 —— 25 项

| # | 检查项 | 操作步骤 | 期望结果 | 结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 首次启动 | 安装后点图标启动 | 深色启动屏（#020817 + 居中品牌 logo）→ 进入登录页；无白屏、无闪退 | NOT_TESTED | expo-splash-screen |
| 2 | 登录 | 输入真实商家账号 → 登录 | 按钮出 loading → 进入首页；凭据错误时显示安全文案（不回显原始报错/状态码） | NOT_TESTED | `POST /auth/login` |
| 3 | 首页真实数据 | 观察首页 6 项指标 | 今日成交额/订单数/支付订单数/新增客户/待处理人工接待/库存预警显示**真实数据**，与 Dashboard 同口径一致；无数据处显示「暂无数据」而**不是 0** | NOT_TESTED | `GET /m/home?sections=overview,inventory` |
| 4 | AI 提问 | AI Tab → 输入「今天店铺怎么样？」→ 发送 | 返回 answer + 数据依据 + 统计区间（非模板假答） | NOT_TESTED | `POST /agent/ask` |
| 5 | 4 条快捷问题 | 依次点 4 个快捷问题 | 每条都真实发起请求并有对应结果（经营概览 / 订单统计 / 销售趋势 / 业务异常） | NOT_TESTED | 后端快通道已覆盖 4 条 |
| 6 | AI loading | 发送后观察 | 输入框禁用、发送按钮 loading、快捷按钮置灰；**无伪造流式打字** | NOT_TESTED | 无 SSE |
| 7 | AI 错误 / 重试 | 断网或飞行模式下发送 | 显示安全错误文案 + 可点「重试」重发同一问题；**不出现假答案**、不崩溃 | NOT_TESTED | 错误码→中文映射 |
| 8 | 订单列表 | 订单 Tab | 真实订单（单号/状态中文/脱敏客户名/金额/时间） | NOT_TESTED | `GET /m/orders` |
| 9 | 状态筛选 | 切换状态 chip | 列表按状态刷新；无结果时「没有符合条件的订单」 | NOT_TESTED | 受后端枚举限制 |
| 10 | 日期筛选 | 切换 默认/近7/近30/近90 天 | 列表按区间刷新，金额与条数随之变化 | NOT_TESTED | — |
| 11 | 订单分页 | 上滑到底 | 自动加载下一页；到底显示「已显示全部」 | NOT_TESTED | limit 20 |
| 12 | 订单详情 | 点任一订单 | 单号/状态/脱敏客户/时间/金额 + **商品明细**（名称/SKU/数量/金额）；可返回 | NOT_TESTED | `GET /m/orders/:orderNo` |
| 13 | 商品 | 商品 Tab → 商品分段 | 真实商品列表（名称/SKU 或「无 SKU」/库存或「暂无数据」/状态）；下拉刷新可用 | NOT_TESTED | `GET /m/products` |
| 14 | 库存 | 切「库存预警」分段 | 低库存数/缺货数/阈值 + 两类清单；无异常时「当前没有需要补货的商品」 | NOT_TESTED | `GET /m/inventory` |
| 15 | 客户 | 我的 → 客户 | 列表为**脱敏**姓名/手机/邮箱 + 订单数；搜索与分页可用 | NOT_TESTED | PII 全脱敏 |
| 16 | 客户详情 | 点任一客户 | 脱敏联系方式、来源、订单数/会话数/待人工数、最近订单金额与时间 | NOT_TESTED | `GET /m/customers/:id` |
| 17 | 待人工 | 我的 → 待人工接待 | 脱敏客户名/渠道/转人工原因/最后消息预览；可刷新分页；页面标注**只读** | NOT_TESTED | 无回复/处理按钮（本阶段不做） |
| 18 | 通知 | 我的 → 通知 | 系统操作记录（标题/资源/成功失败/时间）；页面说明来源 | NOT_TESTED | 数据源为审计日志 |
| 19 | 我的 | 我的 Tab | 顶部显示当前账号真实信息（沿用 SecureStore 字段，缺失则通用文案）；入口可用 | NOT_TESTED | 无虚构店铺名 |
| 20 | 退出登录 | 我的 → 退出登录 | 回登录页；杀掉 App 重开仍在登录页 | NOT_TESTED | 清 SecureStore |
| 21 | 401 自动回登录 | 使 token 失效后操作任意页面 | 自动清会话 → 回登录页 + 「登录状态已失效」；无空白死界面 | NOT_TESTED | 全局拦截器 |
| 22 | 键盘遮挡 | AI / 登录 / 客户搜索唤键盘 | 输入框随键盘上移不被遮挡；键盘弹出时按钮仍可点；收起后布局复位 | NOT_TESTED | **iPhone 上重点看**：键盘 + 底部 Tab 冲突 |
| 23 | 刘海 / Dynamic Island / Safe Area | 在带 Dynamic Island 或刘海的 iPhone 上逐页查看 | 顶部内容不被灵动岛/刘海遮挡；底部不被 Home Indicator 覆盖；四角完整 | NOT_TESTED | 13 页均已用 useSafeAreaInsets（静态） |
| 24 | 下拉刷新 | 首页/订单/商品/库存/客户/待人工/通知 各下拉 | 出刷新指示、数据重取、**不退回整屏骨架**；失败保留旧数据 + 错误条 | NOT_TESTED | 无定时轮询 |
| 25 | 断网后恢复 | 飞行模式 → 打开任意页 → 关飞行 → 下拉重试 | 断网时安全错误文案 + 「重新加载」；恢复后可正常出数据；不崩溃、不显示假数据 | NOT_TESTED | — |

---

## 5. 结果汇总（测试后回填）

| 结果 | 数量 |
|---|---|
| PASS | 0 |
| FAIL | 0 |
| NOT_TESTED | 25 |

### FAIL 记录模板（缺一不可）

```text
编号（1-25）：
设备型号：                     （例 iPhone 15 Pro）
iOS 版本：
App version / buildNumber：    0.1.0 / 1
Build ID：
页面：
操作步骤：
期望结果：
实际结果：
是否必现（必现 / 偶现 x/y 次）：
截图 / 录屏：
严重级别：P0 / P1 / P2
```

**严重级别定义**

| 级别 | 判定 | 处理 |
|---|---|---|
| **P0** | 无法安装/启动、登录不可用、崩溃、金额或 PII 泄漏、401 后卡死无法回登录 | 立即停止验收，进入 MOBILE-09 修复后重新构建 |
| **P1** | 核心页面数据错误或无法加载（首页/订单/详情/客户）、分页或筛选不可用、刷新失败不提示 | 进入 MOBILE-09 修复 |
| **P2** | 文案、间距、截断、键盘/刘海细节、空态措辞等体验问题 | 汇总后随下一版修复，不阻塞内测 |

> 真机发现问题时**先记录、先分级，不要直接大改代码**；修复统一在 MOBILE-09 进行。

---

## 6. 本阶段已在服务器侧完成的静态门禁（非真机）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ EXIT=0（strict + noUncheckedIndexedAccess） |
| `npx expo config --type public --json` | ✅ EXIT=0 |
| name / scheme / version | ✅ 万澜 WANLAN AI / `wanlan` / `0.1.0` |
| ios.bundleIdentifier / buildNumber | ✅ `top.wanwan.wanlan.mobile` / `1` |
| API = `https://api.wan-wan.top` | ✅ |
| `preview.distribution` | ✅ `internal`（符合 iOS 内测目标；iOS 走 **ad-hoc**，需先注册设备） |
| icon / splash / adaptiveIcon 文件 | ✅ 四张 PNG 均在 `assets/`（1024/1024/512/48） |
| 源码 mock / faker / dummy | ✅ 0 |
| 源码 localhost / 127.0.0.1 | ✅ 0 |
| 硬编码 JWT / Bearer | ✅ 0 |
| 日志打印 token / secret | ✅ 0 |
| `.env` 文件 | ✅ 0 |
| token 存储 | ✅ 仅 SecureStore |
| `extra.eas.projectId` | ⚠️ **不存在** → 首次须执行 `npx eas-cli@latest init`（见 §1 第 5 步） |

---

## 7. 当前未验证 / 阻塞项

| 项 | 状态 |
|---|---|
| Apple Developer Program 付费账号 | 需你确认（**无则无法出真机包**） |
| Expo 登录（开发机） | 未执行（服务器按禁止要求**未登录**：无 `~/.eas`、无 `EXPO_TOKEN`） |
| EAS project init（projectId） | 未执行 |
| iPhone UDID 注册 | 未执行 |
| iOS preview build / IPA | **NOT_BUILT** |
| iPhone 安装 | **NOT_TESTED**（**不会**声称已安装） |
| 25 项真机验收 | 全部 NOT_TESTED |
| Android APK | 仍为 NOT_BUILT（本阶段转 iOS；命令见 `MOBILE-08-ANDROID-TEST.md`） |
