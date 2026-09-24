# 淘宝 / 千牛渠道接入指南（taobao-channel-setup）

> SmartCS AI 客户运营系统 · 千牛/旺旺渠道真实接入文档
> 适用版本：`apps/api` channel 模块（TaobaoAdapter 真实实现，2026-08-09 上线）

---

## 0. 一句话说明

本渠道让 SmartCS 能接收淘宝/千牛的买家消息（通过开放平台「消息服务」推送），
并让 AI 的回复通过 TOP 网关（`https://eco.taobao.com/router/rest`）调用
`taobao.openim.immsg.push` 发回买家。

**当前状态**：代码已上线（宽松模式），**只差凭证**——把下面 ②③ 步拿到的三个值
填进服务器环境变量，渠道即刻生效，无需改代码、无需重启部署流程（重启服务即可）。

---

## ① 注册淘宝开放平台应用

1. 打开 https://open.taobao.com ，用**淘宝/千牛主账号**登录。
2. 右上角「开发者中心」→「创建应用」。
   - 应用类型选 **「自用型应用」**（只服务自己店铺，审核最快）；
   - 如果未来要服务多个店铺/对外售卖，选「工具型应用」（审核更严）。
3. 按提示填写应用名称、简介，**必须完成开发者实名认证**（个人实名即可做自用型，
   但涉及 openim 消息权限通常要求**企业资质**，见第 ⑥ 节）。
4. 提交后进入「应用审核」，一般 **1~3 个工作日** 出结果。

> 注意事项：
> - 应用创建后先在「应用详情 → 基本信息」确认状态为「已上线」。
> - 消息服务订阅与 openim 权限是在应用审核通过**之后**再单独申请的。

---

## ② 获取 APP_KEY / APP_SECRET

1. 登录开放平台 →「开发者中心」→ 找到你的应用 →「应用详情」。
2. 页面中「应用凭证」区域：
   - `App Key`（APP_KEY）
   - `App Secret`（APP_SECRET）
3. 复制保存这两个值。**App Secret 只显示一次**，丢失需重置（重置会使旧签名失效）。

---

## ③ 千牛授权，获取 ACCESS_TOKEN

SmartCS 调用开放平台接口需要**商家授权 token**（session）。两种方式任选：

### 方式 A：开放平台控制台一键授权（推荐，最简单）
1. 应用详情 →「授权管理」/「API 授权」→ 找到需要授权的 API
   （如 `taobao.openim.immsg.push`、消息服务订阅）。
2. 用你自己的千牛/淘宝账号点击「授权」。
3. 授权成功后，控制台会展示（或可通过下述 OAuth 流程换取）`access_token`。

### 方式 B：OAuth 授权 URL 换取（标准流程）
1. 拼接授权地址（浏览器打开，用卖家账号登录确认）：
   ```
   https://oauth.taobao.com/authorize?response_type=code&client_id=<APP_KEY>&redirect_uri=<回调地址>&state=1212&view=web
   ```
2. 授权后跳转到 `redirect_uri?code=xxxx&state=1212`，拿到 `code`。
3. 换 token：
   ```
   POST https://oauth.taobao.com/token
   grant_type=authorization_code&client_id=<APP_KEY>&client_secret=<APP_SECRET>&code=<上一步code>&redirect_uri=<回调地址>
   ```
   返回 JSON 中的 `access_token` 即 `TAOBAO_ACCESS_TOKEN`（自用型应用通常长期有效，
   若过期需重新授权刷新）。
4. 也可用「刷新 token」：
   ```
   grant_type=refresh_token&client_id=<APP_KEY>&client_secret=<APP_SECRET>&refresh_token=<refresh_token>
   ```

---

## ④ 环境变量配置（服务器）

> **重要**：SmartCS 服务实际加载的是
> `/root/SmartCS/apps/api/.env`（systemd WorkingDirectory 下的 .env），
> **不是** `/root/SmartCS/.env`（那是旧的残留文件，改它不生效）。

在 `/root/SmartCS/apps/api/.env` 追加/修改（改前先备份）：

```bash
cp /root/SmartCS/apps/api/.env /root/SmartCS/apps/api/.env.bak.$(date +%Y%m%d_%H%M%S)
```

```ini
# ===== 淘宝/千牛渠道 =====
TAOBAO_APP_KEY=<第②步的 App Key>
TAOBAO_APP_SECRET=<第②步的 App Secret>
TAOBAO_ACCESS_TOKEN=<第③步的 access_token>
# 可选：发送方 OpenIM uid（卖家），缺省用 app_key
TAOBAO_SELLER_UID=
# 可选：webhook 严格验签，true=验签失败返回 401（建议凭证到位后开启）
TAOBAO_WEBHOOK_STRICT=true
```

改完重启生效：

```bash
systemctl restart smartcs-api && systemctl status smartcs-api
```

---

## ⑤ webhook 回调地址（开放平台消息服务）

在开放平台「消息服务」（https://open.taobao.com → 消息服务）中：

1. 订阅你需要的消息主题（topic），至少包括：
   - `taobao_trade_TradeSuccess`（交易成功）等交易类主题；
   - 旺旺/千牛聊天消息主题（如 `qianniu_chat_*`，按开放平台实际提供的订阅项为准）。
2. 配置「推送地址」（回调 URL）为：

   ```
   https://api.wan-wan.xyz/webhook/taobao?botId=<你的机器人ID>&tenantId=<租户ID>
   ```

   - `botId` / `tenantId` 换成 SmartCS 中实际的值（可在 dashboard 或数据库查询）；
   - 这两个参数只是业务路由，**不参与签名**（适配器已自动排除）。
3. 平台首次配置会发一个带 `echostr` 的验证请求，本系统会自动回显
   （返回同样的字符串，即通过校验）。
4. 保存后，平台每来一条订阅消息就会 POST 到该地址，
   系统验签 → 解析 → 交给 AI → 调用发送接口回给买家。

> 推送格式兼容：TOP 消息服务推送（`topic/userId/ownerId/timestamp/sign` +
> `content` JSON）、千牛消息（`content` 对象含 `text/pic_url`、`msgType`）、
> 交易消息（`tid`/`buyer_nick`）等。会话维度 = `conversationId` → `tid` → 买家 nick。

---

## ⑥ 权限申请说明（审核与周期）

| 能力 | 需要什么 | 审核周期 | 备注 |
|---|---|---|---|
| 应用创建/实名 | 个人实名或企业认证 | 1~3 个工作日 | 自用型最快 |
| 消息服务订阅 | 应用审核通过后自助订阅 | 即时（部分 topic 需审核） | 交易类 topic 一般直接可用 |
| `taobao.openim.immsg.push`（发消息） | **openim 权限**，通常要求**企业资质** | 3~10 个工作日，可能需签协议 | 这是发送回复的接口，**必须申请** |
| 开放 IM（OpenIM uid） | 买家侧需在开放 IM 体系 | — | 若买家未开通开放 IM，可能无法触达，需确认 |

> 发送接口选型说明：
> - `taobao.openim.tribe.sendmsg`（群消息）已随 OpenIM 群能力下线，**不可用**；
> - 本系统选用 **`taobao.openim.immsg.push`**（开放 IM 单聊消息推送，TOP 网关真实存在）。
> - 凭证/权限未到位时，系统**不会报错**：发送只记警告日志（降级），
>   消息服务验签跳过（宽松模式），等权限下来自动生效。

---

## ⑦ 验证方法

### 本地/服务器连通性（无需凭证即可测）
```bash
# 1. GET 回显（平台配置 URL 时也会用）
curl "https://api.wan-wan.xyz/webhook/taobao?echostr=test"
# 期望输出：test

# 2. POST 伪造消息（宽松模式，期望 code 0）
curl -X POST "https://api.wan-wan.xyz/webhook/taobao?tenantId=<租户ID>" \
  -H "Content-Type: application/json" \
  -d '{"content":"你好","senderId":"buyer_test_1","msgId":"m1","type":"text"}'
# 期望输出：{"code":0,"msg":"ok","data":{"ok":true,"verified":true}}

# 3. 严格模式（TAOBAO_WEBHOOK_STRICT=true 且凭证已配）下，伪造签名应 401
```

### 凭证到位后
1. 重启服务，看日志无「凭证未配齐」警告。
2. 用买家账号在千牛/旺旺给店铺发一条消息 → 后台应收到推送 →
   SmartCS 自动回复出现在买家会话里。
3. 若回复失败，查看服务日志中 `[千牛] 发送失败 ... code=15 ...` 类错误，
   通常是权限未批/授权过期，对照第 ⑥ 节处理。

---

## 常见问题（FAQ）

- **POST 返回 401**：`TAOBAO_WEBHOOK_STRICT=true` 且签名校验失败。
  检查 APP_SECRET 是否与开放平台一致、推送参数是否被篡改。
- **POST 返回 code 1 unprocessable message**：推送内容为空（正常业务不会发生，
  测试时用非空 content）。
- **发送日志 `error_response code=15`**：多为权限不足（openim 未申请）或
  session 失效（重新授权）。
- **验签算法**：TOP 签名 = `md5(secret + 按参数名 ASCII 升序的 key+value 拼接 + secret)`，
  官方 SDK 输出 32 位大写 hex；本系统验签**大小写不敏感**（大写小写都认）。
- **会话维度**：同一买家在同一店铺的会话以买家 nick / tid 为维度，
  与千牛的会话概念一致；不同店铺（不同 tenantId/botId）自动隔离。
