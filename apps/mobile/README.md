# WANLAN AI Mobile（万澜 · 手机里的电商 AI 员工）

PHASE MOBILE-02 仅完成**工程初始化**：主题、API client、SecureStore 认证封装、
App shell、Bottom Tabs、登录页。业务页面（首页 / AI / 订单 / 商品 / 我的）为骨架，
不包含任何模拟数据。

## 技术栈

React Native + Expo + TypeScript（Expo Router 文件式路由）

## 首次运行

```bash
cd apps/mobile
pnpm install
npx expo install --fix     # 按当前 Expo SDK 对齐依赖版本（重要）
pnpm typecheck             # tsc --noEmit
pnpm start                 # 或 pnpm ios / pnpm android
```

> ⚠️ 本阶段**未安装依赖**（PHASE MOBILE-02 禁止安装），
> 因此 `package.json` 中的版本为待对齐的初始值：
> 请以 `npx expo install --fix` 的官方兼容矩阵为准。

## 环境

API 基址默认取 `app.json` 的 `expo.extra.apiBaseUrl`（`https://api.wan-wan.top`），
本地联调可通过环境变量覆盖：

```bash
EXPO_PUBLIC_API_URL=http://<本地网关> pnpm start
```

## 认证

- 登录：`POST /auth/login`（复用现有账号体系，无第二套用户系统）
- 令牌：**仅** `expo-secure-store`（iOS Keychain / Android Keystore）
  - 禁止 AsyncStorage / localStorage / cookie / 日志
- 401：`src/lib/api.ts` 拦截器清空会话并跳回登录

## Bottom Tabs

首页 · **AI** · 订单 · 商品 · 我的（AI 为第二核心 Tab）

## 已就绪的只读接口（PHASE MOBILE-02 新增 BFF）

| 端点 | 用途 | 复用 |
|---|---|---|
| `GET /m/home` | 首页经营摘要（overview / inventory / alerts / trend） | Agent 只读 Tool handler（无 LLM） |
| `GET /m/orders` | 订单列表（状态筛选 + 分页，limit ≤ 50） | search_orders |
| `GET /m/inventory` | 库存预警（低库存 / 缺货） | get_product_inventory |
| `GET /m/alerts` | 经营异常 + 待人工数 + 未读数 | get_business_alerts + HandoffService + NotificationsService |

约定：租户来自 JWT（query 传 `tenantId` 会 400）；数据不可用时返回 `null` + `warnings`，绝不返回 0 冒充真实值。

## 待办（后续阶段）

- MOBILE-03 登录完善（错误态 / 记住邮箱 / 生物识别解锁）
- MOBILE-04 首页接入 `/m/home`
- MOBILE-05 AI 对话接入 `/agent/ask`
- MOBILE-06 订单 / 商品 / 库存页面
- MOBILE-07 Push（需服务端新增 DeviceToken 表与投递任务）
- MOBILE-08 语音输入
- MOBILE-09/10 双端测试与发布
