# ELARIS OSS Policy v1

> 开源软件准入与合规政策（初稿）
> 版本：**v1**
> 生效基准日（sourceAuditDate）：**2026-09-27**
> 配套文件：`docs/oss/ELARIS-OSS-REGISTRY.md`
> 配套条款：`OSS-01A · GRANDFATHERED_BASELINE`（见 §1A，执行载体 `docs/oss/OSS-01A-GRANDFATHERED-BASELINE.md`）
> 审计来源：Marvis 2026-09-27 OSS/Platform Risk Audit
> 适用对象：CodeBuddy / Marvis / OpenCode 及所有向 ELARIS 提交依赖变更的人员

---

## 0. 性质与范围

本 Policy 是 **DESIGN + POLICY 落库产物**，只定义规则与验收口径，**不包含任何代码集成**：

- 不引入第三方源码，不改业务代码，不改 DB，不做 migration
- 不 merge、不 push 到目标分支、不 deploy

本 Policy 与 Registry 配套：**Registry 记录「什么被允许」，Policy 规定「怎么判定、怎么执行、怎么拦截」**。

### 目标

1. 把 Marvis 2026-09-27 的审计结论固化为可长期复用的准入基线。
2. 让 CodeBuddy / Marvis / OpenCode 在同一套机器可验收规则下工作，避免各执一词。
3. 让新增依赖从「事后发现」变为「引入前阻断」。

### 非目标

- 不评估商业采购（云服务、SaaS 订阅）的合同条款
- 不做专利检索与 FTO（Freedom to Operate）分析
- 不替代法务意见；高风险条目仍须法务复核

---

## 1. 十条硬规则（不可豁免）

> 硬规则是 Policy 的最高优先级条款。任何与硬规则冲突的使用形态一律无效，
> 不得以「技术需要」「时间紧」「仅内部使用」为由绕过。

### 规则 1：RED 禁止进入 ELARIS 核心代码

`classification = RED` 的组件，**禁止进入 ELARIS 核心代码**：

- 不得复制其源码进入任何核心目录
- 不得作为运行时依赖（直接或传递）
- 不得通过重命名、改写、翻译、拆包等方式规避判定
- 默认 `usageMode = REJECT`；仅在有明确审计结论支持时可降级为 `REFERENCE_ONLY`

### 规则 2：UNKNOWN 禁止进入生产依赖

`classification = UNKNOWN` 的组件，**禁止进入生产依赖**：

- 不得进入 `package.json` 的 `dependencies`
- 不得进入生产镜像/产物
- 仅允许 `REFERENCE_ONLY` 的研究与对照用途
- 未完成核实前，不得以「临时用一下」形式进入生产路径

### 规则 3：Apache-2.0 必须保留 LICENSE/NOTICE 并标注修改

使用 Apache-2.0 组件时：

- 必须随分发保留原始 `LICENSE` 文本
- 若上游提供 `NOTICE`，必须一并保留并随分发传递
- 对原文件做过任何修改，必须在修改文件中显著标注「本文件已被修改」
- 不得移除或弱化原有的版权、专利、商标与免责声明

### 规则 4：MIT 必须保留 copyright/license notice

使用 MIT 组件时：

- 必须在源码或分发包中保留原始 copyright 声明与 license notice
- 不得移除原始版权行；不得替换为 ELARIS 自有版权
- 不得暗示原作者为 ELARIS 背书

### 规则 5：第三方 Logo、品牌资源、商标不得作为 ELARIS 自有资产

- 第三方 Logo、图标、品牌名称、商标、示例素材不得进入 ELARIS 品牌资产体系
- 不得在对外宣传中声称与上游品牌存在合作关系
- **代码许可证合规 ≠ 商标可使用**：许可证授予的是版权/专利许可，不授予商标权
- 上游若声明「商标使用需另行授权」，必须遵守

### 规则 6：平台授权与代码 LICENSE 分离判断

- **代码许可证**解决「能不能用这份代码」
- **平台授权/开放平台协议**解决「能不能调用这个平台」
- 两者独立，任何一方不通过即不得使用
- 典型场景：SDK 为 MIT，但目标平台未授权该应用调用其接口 → 不得接入
- 典型场景：爬虫库为 Apache-2.0，但目标站点 ToS 禁止抓取 → 不得抓取

### 规则 7：浏览器 Cookie 自动化不得因为代码 LICENSE 合规而自动获准产品化

- 以浏览器 Cookie / 登录态自动化操作为核心的组件，须独立做**平台条款**评估
- 代码许可证合规**不构成**产品化许可
- 涉及绕过风控、模拟真人登录、突破访问限制的，一律视为平台高风险
- 此类组件默认按 RED 处理（如 `xiaohongshu-mcp` 已判定为 RED）

### 规则 8：不得仅凭 README license badge 判定许可证

许可证判定必须基于以下证据，缺一不可：

- 仓库中的 `LICENSE` / `COPYING` / `NOTICE` 原文
- `package.json` 的 `license` 字段
- 实际发布产物中的许可证声明
- lockfile 中的传递依赖许可证
- 存在多目录/多模块时，须逐目录核实（不同目录可以是不同许可证）

只看到 README badge 就下结论的，一律视为未核实（`UNKNOWN`）。

### 规则 9：新增 OSS 依赖必须引用 Registry；未登记则 CI/审核阻断

- 新增任何 OSS 依赖前，必须在 `ELARIS-OSS-REGISTRY.md` 中有对应登记项
- 未登记视为 `UNKNOWN`，按规则 2 处理
- 依赖变更的 PR 必须在描述中给出 Registry 条目 ID（如 `G-03`）
- CI 检查见 §3；审核阻塞与否以 CI 结果为准

### 规则 10：禁止把整个 RED/大型 YELLOW 仓库直接复制进核心目录

- 禁止 `vendor` 式整仓复制
- `YELLOW` 大型仓库（如 `ragflow`）只允许 `SIDECAR` / `ADAPTER` / `REFERENCE_ONLY`
- `RED` 仓库禁止任何形式的整体或部分复制
- 「只复制一小部分」不构成豁免；摘取行为须落在 `CODE_EXTRACTION` 允许范围内并满足许可证义务

---

## 1A. OSS-01A · GRANDFATHERED_BASELINE（存量依赖冻结条款）

> **条款编号**：`OSS-01A`
> **状态**：YES —— 本 Policy **首次启用时**一次性生效
> **执行载体**：`docs/oss/OSS-01A-GRANDFATHERED-BASELINE.md` + `docs/oss/oss-01a-baseline.tsv`
> **优先级**：与 §1 十条硬规则同级；本条款与 §6 兜底条款冲突时以本条款为准

### OSS-01A.1 条款目的

消除 §6「未登记兜底一律 UNKNOWN」与**仓库既有依赖**之间的字面冲突。
若按原文字面执行：Policy 首次启用当天，仓库全部既有直接依赖被判 `UNKNOWN`，
叠加硬规则 2（UNKNOWN 禁入生产依赖）→ **CI 第一天全仓阻断**，Policy 无法落地。

因此本条款规定：**本 Policy 首次启用时，仓库既有依赖进入 `GRANDFATHERED_BASELINE`。**

### OSS-01A.2 Baseline 定义（由三者共同冻结，缺一不成立）

`GRANDFATHERED_BASELINE` = **批准时的以下三项之快照**：

1. **package manifests**：仓库全部 `package.json`（含各 `apps/*`）；
2. **lockfiles**：仓库全部 lockfile（`pnpm-lock.yaml` / 各子项目独立 lockfile / `package-lock.json`）；
3. **依赖解析结果**：由 ① ② 解析得到的 importer 直接依赖集合及其 `resolved` 版本。

冻结基准以 **`baseCommit`** 锚定（本次为 `85c9179160da1ea279da5cff4601d3dbd3143cfc`），
清单以机读锚点 `docs/oss/oss-01a-baseline.tsv` 为唯一事实来源。

> 若 manifest 与 lockfile 冲突，**以 lockfile 解析结果为准**，并在 Baseline 文档中登记为「不一致项」。

### OSS-01A.3 Baseline 内既有依赖的准入判定

Baseline 内既有依赖：

1. **不因本 Policy 首次启用而自动判定为 `UNKNOWN`**；其分类标记为 `GRANDFATHERED_NOT_AUDITED`。
2. **不要求一次性完成全部新增登记流程**（即不要求本周期补齐 Registry 登记）。
3. `OSS-01`（依赖均已登记）的差集计算**排除 Baseline 集合**：
   ```
   未登记集合 = 全部依赖 − Registry 已登记 − Baseline 集合
   ```
   差集非空才阻断。
4. `OSS-03`（UNKNOWN 不进生产依赖）只对 `classification = UNKNOWN` 生效；
   `GRANDFATHERED_NOT_AUDITED` **不计入** `UNKNOWN`。
5. §6 的「未登记组件兜底按 `UNKNOWN`」**不适用于** Baseline 集合。
6. **硬规则 2 对 Baseline 集合不适用**；对 Baseline 之外的新增/变更对象完整适用。

### OSS-01A.4 必须重新执行 OSS-01 ~ OSS-10 的 6 类变更

以下任一项发生，**该变更对象**即离开 Baseline，必须**完整重新执行 `OSS-01` ~ `OSS-10`**：

| # | 触发条件 | 机器判定方式 |
|---|---|---|
| 1 | **新增直接依赖** | manifest 的 `dependencies` / `devDependencies` / `optionalDependencies` 出现新 key |
| 2 | **升级 / 替换现有依赖** | 同名依赖 `resolved` 变化、依赖改名、`overrides`/`resolutions` 变化 |
| 3 | **改变 `usageMode`** | 实际用法超出 Registry `usageMode` 允许集合（`OSS-11`） |
| 4 | **从 `REFERENCE_ONLY` 转为 `CODE_EXTRACTION` / `DIRECT_REUSE`** | 条目由「仅参考」变为「进核心 / 进依赖」 |
| 5 | **引入第三方源码复制或大段改编** | 核心目录出现上游特征文件、版权头、import 路径或相似片段 |
| 6 | **引入新的平台自动化能力** | 新增平台 API 调用路径 / Cookie 登录态路径 / webhook 出站动作 |

- 判定与重跑以**变更对象**为单位，**不是整仓重跑**。
- **明确豁免**（不视为新增依赖）：
  - 传递依赖的**非直接**版本漂移（未被上述 6 类命中）；
  - 不进产品产物、不进 CI 产物的纯 `devDependencies` 新增（走 §1 简化流程，仍须 Registry 留痕）；
  - 注释、文档、测试文件改动。

### OSS-01A.5 Baseline 不是豁免（红线）

**`GRANDFATHERED_BASELINE` 不是许可证、Copyright 或平台条款豁免。**

1. `GRANDFATHERED_NOT_AUDITED` **不等于** `GREEN`；它**只表示「首次启用不阻断」**，不构成任何许可结论。
2. 任何下游角色（CodeBuddy / Marvis / OpenCode / CI）**禁止**将其当 `GREEN` 使用或用于对外合规声明。
3. Baseline 内条目**仍受** `OSS-05`（Apache-2.0 通知义务）、`OSS-06`（MIT notice）、
   `OSS-07`（第三方品牌资产）、`OSS-08`（许可证判定来源）、`OSS-09`（平台风险标注）约束
   —— 前提是该条目的许可证类别已被确认；未确认的，仅豁免「未登记阻断」，不豁免上述义务。
4. **一旦发现 Baseline 内既有依赖实际存在不具备合法使用基础的证据**，
   该依赖**立即**进入 `REVIEW` / `SUSPEND` 流程，并**同时**从 Baseline 冻结清单移出。

`REVIEW` / `SUSPEND` 触发证据（枚举）：

| 证据类型 | 示例 |
|---|---|
| 无 `LICENSE` 文件且无法从 lockfile 取得许可证证据 | 任意包 |
| 许可证含禁止性条款（非商用 / 仅限内部 / 需另行付费） | 商业授权类包 |
| 平台条款禁止该用途 | 平台 SDK 用于未授权用途 |
| 以 Cookie / 登录态绕过平台风控为核心 | 浏览器自动化类包 |
| 许可证与 `package.json` `license` 字段冲突且无法消解 | 多目录多许可证包 |

### OSS-01A.6 REVIEW / SUSPEND 流程

```
发现证据
  → ① 标注 classification = REVIEW（新增引用阻断；已生产条目保持现状但打 P1 告警）
  → ② 若证据确凿 → classification = SUSPEND（新增引用阻断；评估下线路径）
  → ③ 条目从 oss-01a-baseline.tsv 移出，记入 Registry 变更记录
  → ④ 每条须在 Issue 留痕：证据、来源文件、结论、处置
```

- `REVIEW` / `SUSPEND` **不适用**任何自动豁免或超时回收。
- 定级变更须以审计结论为依据（§5 责任分工；CodeBuddy/OpenCode 不得自行升降级）。

### OSS-01A.7 过渡态要求

`GRANDFATHERED_NOT_AUDITED` 是**过渡态，不是终态**。
Baseline 内条目应通过后续审计轮次陆续回收为具名 Registry 条目；
建议每轮固定回收**不少于 5 条**（优先 `prod` 依赖与平台相关包），直至归零。
未完成回收不影响 §OSS-01A.3 的准入结论，但**不得**据此对外声明合规。

### OSS-01A.8 与 CI 规则的关系（对 §3 的修订）

| 规则 | 修订 |
|---|---|
| `OSS-01` | 差集公式改为三步排除（见 OSS-01A.3.3）；输入增加 `oss-01a-baseline.tsv` |
| `OSS-03` | `UNKNOWN` 判定**排除** `GRANDFATHERED_NOT_AUDITED` |
| `OSS-09` | 对 Baseline 内**平台相关**条目改为「命中即告警 + 进 `REVIEW` 候选」，仍不豁免 |
| `OSS-12` | 增加对 `oss-01a-baseline.tsv` 的结构校验 |
| **新增 `OSS-13`** | **Baseline 冻结指纹校验**（见 §3 表第 13 行） |

### OSS-01A.9 适用范围声明

> **本 Policy 的「未登记即阻断」（规则 9 / `OSS-01`）自本版起，其强制约束面为
> 「Baseline 之外的新增与变更对象」；Baseline 内既有依赖的准入，由 `OSS-01A` 单独规定。**


---

## 2. 分级与使用形态判定

### 2.1 分级判定矩阵

| classification | 生产依赖 | 核心代码 | 隔离部署 | 仅参考 |
| --- | --- | --- | --- | --- |
| `GREEN` | 允许 | 允许 | 允许 | 允许 |
| `YELLOW` | 有条件 | **禁止整体复制** | 允许（ADAPTER/SIDECAR） | 允许 |
| `RED` | 禁止 | 禁止 | 禁止 | 允许（REFERENCE_ONLY） |
| `UNKNOWN` | 禁止 | 禁止 | 禁止 | 允许 |

### 2.2 定级判定顺序（自上而下，命中即停）

1. 许可证是否存在禁止性条款（非商用、仅限内部、需另行付费）→ `RED`
2. 是否以 Cookie 自动化 / 绕过平台风控为核心 → `RED`（规则 7）
3. 平台授权无法获得或条款明确禁止用途 → `RED`
4. 许可证未核实、或存在许可证冲突 → `UNKNOWN`（若另有平台高风险 → `YELLOW`）
5. 许可证合规，但平台/条款/品牌风险未清 → `YELLOW`
6. 许可证合规、平台风险低、义务可履行 → `GREEN`

> 定级由 Marvis 审计给出；本 Policy 不重新定级任何条目。
> 本次清单一致性修正：**`microsoft/agent-framework` 明确登记为 GREEN**，不得降级。

### 2.3 usageMode 与分级的最小匹配要求

| classification | 允许的最大 usageMode 集合 |
| --- | --- |
| `GREEN` | `CODE_EXTRACTION` / `DIRECT_REUSE` |
| `YELLOW` | `ADAPTER` / `SIDECAR` / `REFERENCE_ONLY` |
| `RED` | `REFERENCE_ONLY` 或 `REJECT` |
| `UNKNOWN` | `REFERENCE_ONLY` |

超出上限的使用形态须走 §4 例外审批流程。

---

## 3. CI 可检查规则清单

> 用于把 Policy 落地为机器可验收门禁。每条给出：检查目标 → 判定方法 → 失败动作。
> 未实现时视为「待接线」，不得因此放松人工审核。

| # | 规则 ID | 对应硬规则 | 检查目标 | 判定方法 | 失败动作 |
| --- | --- | --- | --- | --- | --- |
| 1 | `OSS-01` | 9, **1A** | 依赖均已登记（Baseline 外） | 解析 lockfile 与各 `package.json` 依赖集合，**依次减去** Registry §3 `registry-tsv` 的 `project` 集合 **与** `oss-01a-baseline.tsv` 的 `package` 集合，取剩余差集 | 阻断：差集非空即失败，输出未登记包名（**Baseline 内不报**） |
| 2 | `OSS-02` | 1 | RED 未进入核心 | 断言核心目录（`apps/*/src`、`packages/*/src`）无 RED 条目对应包名/源码特征 | 阻断 |
| 3 | `OSS-03` | 2, **1A** | UNKNOWN 未进入生产依赖 | 断言 `dependencies`（非 `devDependencies`）中无 `classification=UNKNOWN` 条目；**`GRANDFATHERED_NOT_AUDITED` 不计入 UNKNOWN** | 阻断（仅针对 `UNKNOWN`） |
| 4 | `OSS-04` | 1,10 | 无整仓复制 | 检测核心目录下是否存在第三方仓库特征文件（上游 `LICENSE`+`package.json` name 不属本仓库、`.git` 残留、上游目录名） | 阻断 |
| 5 | `OSS-05` | 3 | Apache-2.0 依从 | 扫描所有 Apache-2.0 组件：分发产物内存在 `LICENSE`；上游有 `NOTICE` 时产物内亦有；修改文件带修改声明 | 阻断并列出缺失项 |
| 6 | `OSS-06` | 4 | MIT notice 保留 | 扫描 MIT 组件：源码/产物内保留原始 copyright 行，未被替换为 ELARIS 版权 | 阻断 |
| 7 | `OSS-07` | 5 | 无第三方品牌资产 | 扫描品牌资源目录与静态资源，命中第三方 Logo/商标清单即失败 | 阻断 |
| 8 | `OSS-08` | 8 | 许可证非 badge 判定 | 断言每条 Registry 条目存在许可证证据来源字段（`LICENSE` 路径 / lockfile 条目），无证据视为 `UNKNOWN` | 阻断 |
| 9 | `OSS-09` | 6,7 | 平台风险标注 | 断言涉及平台开放接口、爬虫、Cookie 自动化的条目在 Registry 中 `platformRisk` 不为空且不为 `LOW`（除非有审计结论支持）；**Baseline 内命中者**同时进 `REVIEW` 候选 | 告警 + 人工复核 |
| 10 | `OSS-10` | 9 | PR 引用 Registry | 检查依赖变更 PR 描述是否含 Registry 条目 ID（正则 `\b[GYRU]-\d{2}\b`） | 阻断：缺少引用即要求补充 |
| 11 | `OSS-11` | 1,2 | usageMode 合规 | 对照 §2.3 矩阵，断言条目实际使用形态未超出其分级允许集合 | 阻断 |
| 12 | `OSS-12` | 全部 | Registry 结构校验 | 断言 Registry §3 TSV 行数 == §2 条目数；字段数 == 10；`classification`/`usageMode` 取值在枚举内；`sourceAuditDate` 格式 `YYYY-MM-DD` | 阻断 |
| 13 | `OSS-13` | **1A** | Baseline 冻结指纹校验 | 计算 Baseline 文档 §A.1.1 的 10 项 manifest/lockfile 的 SHA-256 并与文档值比对；不一致则输出差异文件清单，并对差异文件涉及的**变更对象**触发 §OSS-01A.4 全量重跑；同时校验 `oss-01a-baseline.tsv` 结构（8 字段、`id` 匹配 `B-\d{3}`、`classification` 恒为 `GRANDFATHERED_NOT_AUDITED`） | `tsv` 结构错 → 阻断；指纹不一致 → 对差异对象重跑 `OSS-01`~`OSS-10` |

### 3.1 机读锚点

**两个独立锚点，不可混用：**

| 锚点 | 文件 | 内容 | 用途 |
|---|---|---|---|
| ① Registry 锚点 | `registry-tsv`（Registry §3 代码块） | 24 条审计结论 | 判定「允许什么」 |
| ② Baseline 锚点 | `docs/oss/oss-01a-baseline.tsv` | 93 行既有依赖冻结清单 | 判定「哪些是存量、不阻断」 |

- 分隔符 `|`，编码 UTF-8
- `OSS-01` 差集顺序固定：`全部依赖 − registry-tsv 的 project − oss-01a-baseline.tsv 的 package`
- Baseline 锚点字段顺序固定：`id|package|kind|app|specifier|resolved|classification|registered`（8 字段）
- 枚举约束：
  - `classification ∈ {GREEN, YELLOW, RED, UNKNOWN}`
  - `usageMode ∈ {CODE_EXTRACTION, DIRECT_REUSE, ADAPTER, SIDECAR, REFERENCE_ONLY, REJECT}`
  - `commercialUse / closedSourceAllowed ∈ {YES, NO, UNKNOWN}`
  - `dependencyRisk / platformRisk ∈ {LOW, MEDIUM, HIGH, UNKNOWN}`
  - Baseline 锚点：`kind ∈ {prod, dev, optional}`；`app ∈ {., apps/api, apps/dashboard, apps/mobile, apps/website, apps/widget}`；`classification ≡ GRANDFATHERED_NOT_AUDITED`；`registered ∈ {YES, NO}`

### 3.2 接线状态

本次仅输出规则清单，**未接线任何 CI**。接线前所有依赖变更仍走人工审核，
人工审核同样按上表口径执行。

> **事实修正（本版实测）**：仓库根目录**当前不存在 `.cnb.yml`**。
> 上一版 Policy 中「现有 `.cnb.yml` 位于根目录」的表述与实测不符，本版已修正。
> 后续接线 `OSS-01` ~ `OSS-13` 时需先建立或引入流水线配置。

---

## 4. 例外与豁免流程

例外申请须同时满足：

1. 列出 Registry 条目 ID 与当前分级
2. 说明无法通过常规形态满足需求的原因
3. 给出风险缓解措施与回滚方案
4. 经人工审批并在 Registry `conditions` 字段留痕（含审批 Issue 链接）
5. 例外有时效，到期须重新评估

**不可豁免**：硬规则 5（品牌/商标）、硬规则 8（不得凭 badge 判定）。
**默认不豁免**：硬规则 1、2（RED / UNKNOWN 准入）。

---

## 5. 责任分工

| 角色 | 职责 |
| --- | --- |
| Marvis | 出具审计结论、定级；维护风险等级的权威口径 |
| CodeBuddy | 执行 Policy；维护 Registry；在依赖变更 PR 中引用 Registry 条目 |
| OpenCode | 遵循同一 Registry；与 CodeBuddy 使用同一 TSV 机读锚点 |
| 人工审批 | 处理 §4 例外；确认高平台风险条目的产品化决策 |

---

## 6. UNKNOWN 项处理约定

本次审计遗留的 UNKNOWN 项（详见 Registry §2.4）：

- `sentry/sentry`：整仓口径未核实，须逐目录确认许可证后再定级
- `ragflow` 未核实的 `deepdoc` / model 权重：与已核实源码分账管理
- 其它尚未完成 lockfile/LICENSE 全量审计的依赖
- 未登记组件的兜底条款（一律按 UNKNOWN 处理）

处理约定：

1. 一律禁止进入生产依赖
2. 须在后续审计轮次中完成核实并拆分为具名条目
3. 核实完成后更新 Registry 的 §2 与 §3，并更新 `sourceAuditDate`

---


### 6.1 兜底条款的适用范围（由 `OSS-01A` 修订）

> §6 第 4 条「未登记组件的兜底条款（一律按 UNKNOWN 处理）」**自本版起收窄适用范围**：

| 对象 | 兜底是否适用 |
|---|---|
| Baseline 之外的新增 / 变更依赖（§OSS-01A.4 的 6 类） | ✅ 适用 → 未登记即 `UNKNOWN`，按硬规则 2 阻断 |
| `GRANDFATHERED_BASELINE` 内的既有依赖 | ❌ **不适用**；其分类为 `GRANDFATHERED_NOT_AUDITED`，非 `UNKNOWN` |

收窄依据见 §1A。若不收窄，Policy 首次启用当日全仓既有依赖将被判 `UNKNOWN`，
与硬规则 2 叠加导致 CI 全仓阻断，Policy 无法落地。

---

## 6B. Baseline 回收计划

`GRANDFATHERED_NOT_AUDITED` 为过渡态（§OSS-01A.7）。回收要求：

| 项 | 要求 |
|---|---|
| 回收目标 | Baseline 内 93 行 / 70 包**全部**回收为 Registry 具名条目 |
| 单轮下限 | 每审计轮次 ≥ 5 条（优先 `prod` 依赖与平台相关包） |
| 优先级顺序 | ① 48 个 `prod` 包 → ② 平台相关包 → ③ 22 个 `dev`-only 包 |
| 回收动作 | 补齐 Registry 11 字段 + `registry-tsv` 行 + 从 `oss-01a-baseline.tsv` 移出 + 记变更记录 |
| 单轮上限告警 | 单轮回收 > 30 条须拆分轮次，避免一次性误判 |

> 回收**不改变**已回收条目的历史准入结论；仅把 `GRANDFATHERED_NOT_AUDITED` 替换为具名 `classification`。

---

## 7. DESIGN_ONLY 结论

本次交付为 **DESIGN + POLICY 落库**，结论如下：

1. 已建立 Registry（24 条）与 Policy v1 两份文档，构成可长期复用的准入基线
2. 已输出 12 条 CI 可检查规则，具备机读锚点与枚举约束，具备接线条件
3. **未触及任何业务代码、DB、migration**，未执行 merge / push / deploy
4. **未执行任何代码集成**，本次不引入任何第三方源码或依赖
5. 本次为 v1 初稿；后续核实 UNKNOWN 项时按 §4 / §6 流程修订，不改变本 Policy 的硬规则

### 7.1 本版（`OSS-01A` 增补）新增交付

| 项 | 内容 | 文件 |
|---|---|---|
| 新条款 | `OSS-01A · GRANDFATHERED_BASELINE`（§1A，9 小节） | 本文件 §1A |
| 新 CI 规则 | `OSS-13` Baseline 冻结指纹校验 | 本文件 §3 第 13 行 |
| 修订 CI 规则 | `OSS-01`（差集三步）、`OSS-03`（排除 `GRANDFATHERED_NOT_AUDITED`）、`OSS-09`（Baseline 命中进 `REVIEW` 候选）、`OSS-12`（增 Baseline 结构校验） | 本文件 §3 |
| 新执行载体 | `OSS-01A-GRANDFATHERED-BASELINE.md`（A.0–A.10） | `docs/oss/` |
| 新机读锚点 | `oss-01a-baseline.tsv`（93 行，8 字段，70 包） | `docs/oss/` |
| 兜底收窄 | §6 兜底条款适用范围 | 本文件 §6.1 |
| 回收计划 | Baseline 回收节奏与优先级 | 本文件 §6B |
| 事实修正 | 根目录**无** `.cnb.yml`；根 lock `importers` 仅 3 个（无 mobile/website） | 本文件 §3.2 / Baseline 文档 §A.4.1 |

**`OSS-01A` 的状态**：`DESIGN + POLICY ONLY`。

- 未引入任何第三方源码或依赖
- 未修改业务代码、未修改 DB、未执行 migration
- 未 merge、未 push 到目标分支、未 deploy
- Baseline 清单由 `baseCommit 85c9179` 的 manifest + lockfile **实测解析**得出，非人工估列

### 7.2 与 RFC-002 `Z-F8` 的关系

本条款即 RFC-002 待裁决项 `Z-F8`（OSS 存量依赖豁免口径）的**口径落地**。
`Z-F8` 在 RFC-002 侧可据本文件闭合为：

> 采纳口径 1（存量豁免）：定义 `GRANDFATHERED_BASELINE` = 本版冻结的 manifest + lockfile + 解析结果快照；
> 存量视为既有合规，只对新增/变更对象执行 `OSS-01` / `OSS-03`；
> 该豁免**不延伸**至许可证、Copyright 与平台条款（§OSS-01A.5）。

### 7.3 剩余人工签核

| # | 事项 | 需签核 | 阻塞 |
|---|---|---|---|
| S-1 | `OSS-01A` 条款生效（本次增补） | 合规 / 产品 | `OSS-01` 接线 |
| S-2 | Baseline `baseCommit` 是否随分支推进重锚（当前钉在 `85c9179` master） | 架构负责人 | `channel/elaris` 合并 |
| S-3 | `m0-preclean` 对 stale schema 的处置与 Baseline 无耦合，确认互不阻塞 | 数据架构 | — |
