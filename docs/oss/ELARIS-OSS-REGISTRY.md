# ELARIS OSS Registry

> 机器可验收的开源组件准入注册表
> 版本：v1.1（Registry · R9 Closure）
> sourceAuditDate：**2026-09-27**
> 审计来源：Marvis 2026-09-27 OSS/Platform Risk Audit
> 适用对象：CodeBuddy / Marvis / OpenCode 及所有向 ELARIS 提交依赖变更的人员
> 配套条款：`OSS-01A · GRANDFATHERED_BASELINE`（既有依赖冻结，见 Policy §1A 与 `OSS-01A-GRANDFATHERED-BASELINE.md`）

---

## 0. 本文件的性质

本 Registry 是 **DESIGN + POLICY 落库产物**。它只登记「审计结论」，不包含任何代码集成：

- 不引入任何第三方源码
- 不修改业务代码、不修改数据库、不做 migration
- 不 merge、不 push 到目标分支、不 deploy

本文件与 `ELARIS-OSS-POLICY-v1.md` 配套使用。**本文件是准入结论，Policy 是判定与执行规则**；
两者冲突时以 Policy 的硬规则为准，并以 Issue 记录结论修订。

**Registry 一经登记即为灰度以上唯一事实来源**：任何新增 OSS 依赖必须先在本文件出现对应条目，
未登记者视为 `UNKNOWN`，按硬规则 2 处理（禁止进入生产依赖）。

### 0.1 与 `OSS-01A` 的关系（本版新增）

本 Registry **只登记审计结论**，**不承载**仓库既有依赖的冻结清单。两者的分工：

| 集合 | 载体 | 条数 | 语义 |
|---|---|---|---|
| 待引入 / 已审计候选 | **本文件** §2 + §3 `registry-tsv` | 24 | 审计结论（GREEN/YELLOW/RED/UNKNOWN） |
| 仓库既有依赖（存量） | `docs/oss/oss-01a-baseline.tsv` | 93 行 / 70 包 | `GRANDFATHERED_NOT_AUDITED`（非审计结论） |

**关键约束**：

1. Baseline 内条件**不是** Registry 条目，**不得**写入本文件 §2 / §3。
2. 未登记即阻断（硬规则 9 / `OSS-01`）的差集计算**必须同时排除两个集合**：
   ```
   未登记集合 = 全部依赖 − registry-tsv.project − oss-01a-baseline.tsv.package
   ```
3. Baseline 条目经后续审计核实后，**回收进本文件**（补齐 11 字段 + `registry-tsv` 行），
   同时从 `oss-01a-baseline.tsv` 移出（Policy §6B 回收计划）。
4. Baseline 的 `GRANDFATHERED_NOT_AUDITED` **不得**被解读为 `GREEN` 或任何许可结论（Policy §OSS-01A.5）。

---

## 1. 字段定义与取值域

| 字段 | 含义 | 取值域 |
| --- | --- | --- |
| `project` | 项目/仓库标识，审计清单中的原始名称 | 字符串 |
| `license` | 经核实的许可证标识（SPDX 优先） | SPDX ID / `UNKNOWN` / `NONE-PROPRIETARY` |
| `commercialUse` | 许可证是否允许商业使用 | `YES` / `NO` / `UNKNOWN` |
| `closedSourceAllowed` | 是否允许以闭源形式分发/衍生 | `YES` / `NO` / `UNKNOWN` |
| `licenseNoticeObligation` | 必须履行的许可证义务 | 自由文本，无义务写 `NONE` |
| `dependencyRisk` | 依赖层面风险（许可证冲突、传递依赖、弃用等） | `LOW` / `MEDIUM` / `HIGH` / `UNKNOWN` |
| `platformRisk` | 平台层面风险（平台授权、ToS、反爬、品牌、Cookie 自动化等） | `LOW` / `MEDIUM` / `HIGH` / `UNKNOWN` |
| `classification` | 准入分级 | `GREEN` / `YELLOW` / `RED` / `UNKNOWN` |
| `usageMode` | 允许的使用形态（见 §2） | `CODE_EXTRACTION` / `DIRECT_REUSE` / `ADAPTER` / `SIDECAR` / `REFERENCE_ONLY` / `REJECT` |
| `conditions` | 使用前置条件，未满足即不得使用 | 自由文本，无条件写 `NONE` |
| `licenseEvidence` | **许可证证据来源（通用字段，R8/`OSS-08` 强制）**：判定 `license` 所依据的一手证据 | 自由文本；至少 1 条可复核来源（`LICENSE` 文件路径 / npm manifest `license` 字段 / lockfile resolved 条目 / GitHub license API）；无证据即 `license = UNKNOWN` |
| `sourceAuditDate` | 本次审计基准日 | 固定 `2026-09-27` |

### 1.1 classification 语义

| 分级 | 语义 | 允许范围 |
| --- | --- | --- |
| `GREEN` | 许可证与平台风险均可接受，允许进入核心代码 | 允许进入 ELARIS 核心代码；按许可证义务履约 |
| `YELLOW` | 有条件可用，需要隔离或人工复核 | **不得整体复制进核心目录**；仅允许 `ADAPTER` / `SIDECAR` / `REFERENCE_ONLY`（例外需人工审批并记录） |
| `RED` | 许可证或平台风险不可接受 | **禁止进入 ELARIS 核心代码**；仅允许 `REFERENCE_ONLY`（或直接 `REJECT`） |
| `UNKNOWN` | 未完成核实 | **禁止进入生产依赖**；可作 `REFERENCE_ONLY` 研究用途 |

### 1.2 usageMode 语义

| 取值 | 含义 |
| --- | --- |
| `CODE_EXTRACTION` | 允许从中摘取代码片段并入 ELARIS 代码库（须满足许可证义务） |
| `DIRECT_REUSE` | 允许作为依赖直接引入并按其原形使用 |
| `ADAPTER` | 仅在适配层调用，边界清晰、可替换，不侵入核心领域逻辑 |
| `SIDECAR` | 以独立进程/独立服务方式旁路运行，通过接口交互 |
| `REFERENCE_ONLY` | 仅可作设计参考、阅读、对照；不得复制代码、不得作为运行时依赖 |
| `REJECT` | 不得以任何形式并入 ELARIS（含参考性复制） |

### 1.3 `licenseEvidence` 语义（通用字段）

`licenseEvidence` 为 **§1 通用字段**，对 §2 全部条目强制。规则：

1. **每条登记必须有可追溯证据**（Policy `OSS-08`）。只看到 README badge、无 `LICENSE` 文件、无 manifest 字段者，一律记 `license = UNKNOWN`。
2. 证据必须指向**一手来源**：仓库 `LICENSE` 文件路径、npm manifest `license` 字段、npm tarball 内 `LICENSE`、lockfile 的 `resolved` 条目、或平台 license API 返回值。
3. 证据互相矛盾时（如 manifest 写 A、仓库无 `LICENSE` 写 B）→ **按最保守值记 `UNKNOWN`**，并在条目内列出矛盾项。
4. `licenseEvidence` 只记录证据，**不改变** `classification`；但 `classification` 不得高于证据所能支持的上限。
5. 无证据条目不得标 `GREEN`。

---

## 2. Registry 主表

> 共 **24 条登记项**：GREEN 5、YELLOW 10、RED 4、UNKNOWN 5。
> （G-02 `email-verifier` 为已作废编号的墓碑条目，**不计入** 24 条；`G-03` 的传递依赖闭包见 §2.5，亦不计入主表 24 条。）
> 所有条目的 `sourceAuditDate` 均为 `2026-09-27`。
> 变更（R9 Closure）：`email-verifier` 由 `GREEN` 降为 `UNKNOWN`（见 §2.4 `U-05`）；原 G-02 编号保留但**不再指向 GREEN 条目**。

### 2.1 GREEN（5 项）

#### G-01 · e-commerce-agents

- **license**：MIT
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 copyright 与 license notice；不得移除原始版权声明
- **dependencyRisk**：LOW
- **platformRisk**：LOW
- **classification**：`GREEN`
- **usageMode**：`CODE_EXTRACTION`
- **conditions**：仅在抽取处保留 MIT 版权与许可证声明；抽取后不得暗示原作者为 ELARIS 背书
- **sourceAuditDate**：2026-09-27

#### G-02 · email-verifier（**编号保留，条目已移出 GREEN**）

> ⚠️ **本条目不再有效。** 经 H1 一轮一手证据核验（`docs/hunter/H1-OSS-AUDIT-EMAIL-VERIFIER.md`），
> 原登记 `license = MIT / GREEN / DIRECT_REUSE` **无法追溯到任何一手证据**。
> 现条目见 **§2.4 `U-05 · email-verifier`**：`license = UNKNOWN`、`classification = UNKNOWN`、
> `usageMode = REFERENCE_ONLY`、准入状态 `NOT_APPROVED`。
> **G-02 编号同时从 §3 `registry-tsv` 移除**（避免同一编号双值，违反唯一性）。

#### G-03 · pg-boss（**canonical · 唯一版本**）

- **project**：`pg-boss`（上游 `timgit/pg-boss`）
- **license**：`MIT`
- **commercialUse**：`YES`
- **closedSourceAllowed**：`YES`
- **licenseNoticeObligation**：保留 LICENSE 全文与 copyright notice
- **dependencyRisk**：`LOW`
- **platformRisk**：`LOW`
- **classification**：`GREEN`
- **usageMode**：`DIRECT_REUSE`
- **conditions**：以 package.json 依赖方式引入；不得复制源码进核心目录；版本需锁定（pin 精确版本）并经 lockfile 审计；升级需重新核对 lockfile 与传递依赖许可证
- **licenseEvidence**：
  - `package/LICENSE` @ `timgit/pg-boss` master（GitHub license API：`path=LICENSE`, `spdx_id=MIT`, `size=1076`）
  - npm manifest `pg-boss@12.35.0` → `license: "MIT"`
  - npm tarball `package/LICENSE` → `The MIT License (MIT) / Copyright (c) 2016 Tim Jones`
- **verification**：
  - `pinnedVersion: 12.35.0`
  - `tarballSha256: e950badadb4649bf1f3fd516cf006d1f0890e24d4494e4c0a170ac06cecdaa00`
  - `engines.node: ">=22.12.0"`
- **sourceAuditDate**：`2026-09-27`

> **字段裁决记录（R9 Closure）**：`classification = GREEN` / `usageMode = DIRECT_REUSE` / `license = MIT` 为 canonical 值；
> `closedSourceAllowed = YES` 取代旧候选版本的 `CONDITIONAL`（MIT 无 copyleft，`CONDITIONAL` 属枚举外取值）。
> `licenseEvidence` 为三处一手同证，无一处矛盾。
> **pg-boss 直接依赖 + 传递依赖闭包登记见 §2.5（`T-03-xx`），不得计入 `GRANDFATHERED_BASELINE`。**

#### G-04 · bullmq

- **license**：MIT
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 copyright 与 license notice
- **dependencyRisk**：LOW
- **platformRisk**：LOW
- **classification**：`GREEN`
- **usageMode**：`DIRECT_REUSE`
- **conditions**：保留 MIT 声明；依赖 Redis 属运维前提，不属许可证约束
- **sourceAuditDate**：2026-09-27

#### G-05 · opentelemetry-js

- **license**：Apache-2.0
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 `LICENSE` 与 `NOTICE`（如存在）；标注对原文件的修改
- **dependencyRisk**：LOW
- **platformRisk**：LOW
- **classification**：`GREEN`
- **usageMode**：`DIRECT_REUSE`
- **conditions**：随分发保留 `LICENSE`/`NOTICE`；若有修改必须显著标注修改
- **sourceAuditDate**：2026-09-27

#### G-06 · microsoft/agent-framework

- **license**：MIT
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 copyright 与 license notice
- **dependencyRisk**：LOW
- **platformRisk**：LOW
- **classification**：`GREEN` ← **清单一致性修正：明确登记为 GREEN**
- **usageMode**：`CODE_EXTRACTION`
- **conditions**：保留 MIT 声明；注意代码许可证合规不等于可使用 Microsoft 商标/品牌资源（见 Policy 硬规则 5）
- **sourceAuditDate**：2026-09-27

### 2.2 YELLOW（10 项）

> 通用条件：**禁止整体复制进 ELARIS 核心目录**（Policy 硬规则 10）。
> 仅允许 ADAPTER / SIDECAR / REFERENCE_ONLY，且必须先登记、后引入。

#### Y-01 · ShopeX/OMS

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：仅作业务领域参考；须先完成许可证核实；不得复制其业务代码
- **sourceAuditDate**：2026-09-27

#### Y-02 · laravel-ai-price-intelligence

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：LOW
- **classification**：`YELLOW`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：技术栈为 Laravel/PHP，与 ELARIS Node 栈不同；仅作算法与提示词设计参考，不引源码
- **sourceAuditDate**：2026-09-27

#### Y-03 · keelead

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：须先完成许可证核实；不得整体复制
- **sourceAuditDate**：2026-09-27

#### Y-04 · ProspectKit

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：涉及获客/线索流程，须评估平台条款与隐私合规后再定使用形态
- **sourceAuditDate**：2026-09-27

#### Y-05 · crawlee

- **license**：Apache-2.0
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 `LICENSE`/`NOTICE`；标注修改
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`ADAPTER`
- **conditions**：代码许可证合规**不代表**目标站点条款合规；须逐站点评估 robots/ToS 与 Cookie 自动化限制；仅经适配层调用
- **sourceAuditDate**：2026-09-27

#### Y-06 · crawl4ai

- **license**：Apache-2.0
- **commercialUse**：YES
- **closedSourceAllowed**：YES
- **licenseNoticeObligation**：保留 `LICENSE`/`NOTICE`；标注修改
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`SIDECAR`
- **conditions**：Python 生态，须以独立服务旁路部署；须评估目标站点条款与 Cookie 自动化限制
- **sourceAuditDate**：2026-09-27

#### Y-07 · typescript-sdk

- **license**：UNKNOWN（未完成全量 LICENSE 核实，且同名项目多，需锁定上游）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：须先消除同名歧义并锁定具体上游仓库与版本，完成 LICENSE 核实
- **sourceAuditDate**：2026-09-27

#### Y-08 · ragflow

- **license**：Apache-2.0（**仅限已核实源码部分**；deepdoc/model 权重未见 LICENSE，见 U-02）
- **commercialUse**：YES（限已核实部分）
- **closedSourceAllowed**：YES（限已核实部分）
- **licenseNoticeObligation**：保留 `LICENSE`/`NOTICE`；标注修改
- **dependencyRisk**：MEDIUM
- **platformRisk**：MEDIUM
- **classification**：`YELLOW`
- **usageMode**：`SIDECAR`
- **conditions**：**禁止整体复制**；deepdoc/model 权重在完成核实前按 UNKNOWN 处理，不得进入生产依赖；以独立服务旁路接入
- **sourceAuditDate**：2026-09-27

#### Y-09 · 1688-open-sdk-v2

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：HIGH（平台开放授权与调用条款独立于代码许可证）
- **classification**：`YELLOW`
- **usageMode**：`ADAPTER`
- **conditions**：平台授权与代码 LICENSE 分离判断；须确认 1688 开放平台授权范围与调用配额后才可接入
- **sourceAuditDate**：2026-09-27

#### Y-10 · pdd-node-sdk

- **license**：UNKNOWN（未完成全量 LICENSE 核实）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定 —— 引入前须补齐
- **dependencyRisk**：MEDIUM
- **platformRisk**：HIGH（拼多多开放平台授权与调用条款独立于代码许可证）
- **classification**：`YELLOW`
- **usageMode**：`ADAPTER`
- **conditions**：平台授权与代码 LICENSE 分离判断；须确认平台授权范围、风控与调用限制后经适配层接入
- **sourceAuditDate**：2026-09-27

### 2.3 RED（4 项）

> **禁止进入 ELARIS 核心代码**（Policy 硬规则 1）。

#### R-01 · customer-support-ai-employee

- **license**：UNKNOWN / 存在冲突（未通过全量 LICENSE 核实）
- **commercialUse**：NO（结论：不建议）
- **closedSourceAllowed**：NO
- **licenseNoticeObligation**：不适用（不得使用）
- **dependencyRisk**：HIGH
- **platformRisk**：HIGH
- **classification**：`RED`
- **usageMode**：`REJECT`
- **conditions**：禁止任何形式的代码并入
- **sourceAuditDate**：2026-09-27

#### R-02 · reacherhq/check-if-email-exists

- **license**：存在冲突/高风险（未通过全量 LICENSE 核实）
- **commercialUse**：NO（结论：不建议）
- **closedSourceAllowed**：NO
- **licenseNoticeObligation**：不适用（不得使用）
- **dependencyRisk**：HIGH
- **platformRisk**：HIGH
- **classification**：`RED`
- **usageMode**：`REJECT`
- **conditions**：禁止任何形式的代码并入（注意与 GREEN 的 G-02 `email-verifier` 区分，两者不是同一项目）
- **sourceAuditDate**：2026-09-27

#### R-03 · langfuse（整仓）

- **license**：整仓存在禁止性条款（部分目录/功能为商业限制许可）
- **commercialUse**：NO（整仓口径）
- **closedSourceAllowed**：NO（整仓口径）
- **licenseNoticeObligation**：不适用（不得使用）
- **dependencyRisk**：HIGH
- **platformRisk**：HIGH
- **classification**：`RED`
- **usageMode**：`REJECT`
- **conditions**：**整仓 RED**，不得按目录拆分子目录视为可用；禁止任何形式并入
- **sourceAuditDate**：2026-09-27

#### R-04 · xiaohongshu-mcp

- **license**：未见合规开源许可
- **commercialUse**：NO
- **closedSourceAllowed**：NO
- **licenseNoticeObligation**：不适用（不得使用）
- **dependencyRisk**：HIGH
- **platformRisk**：HIGH（浏览器 Cookie 自动化，违反平台条款）
- **classification**：`RED`
- **usageMode**：`REJECT`
- **conditions**：禁止并入；**即使其代码许可证合规，Cookie 自动化亦不获准产品化**（Policy 硬规则 7）
- **sourceAuditDate**：2026-09-27

### 2.4 UNKNOWN（5 项）

> **禁止进入生产依赖**（Policy 硬规则 2）。仅允许 `REFERENCE_ONLY`。

#### U-01 · sentry/sentry

- **license**：UNKNOWN（整仓口径未核实：主项目与自托管/企业目录许可不同，需逐目录确认）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定
- **dependencyRisk**：UNKNOWN
- **platformRisk**：UNKNOWN
- **classification**：`UNKNOWN`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：须逐目录核实许可证（区分开源主体与商业目录）后方可重新定级；在此之前不得进入生产依赖
- **sourceAuditDate**：2026-09-27

#### U-02 · ragflow 未核实的 deepdoc/model 权重

- **license**：UNKNOWN（deepdoc 目录与 model 权重未见 LICENSE/许可声明）
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定
- **dependencyRisk**：UNKNOWN
- **platformRisk**：UNKNOWN
- **classification**：`UNKNOWN`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：与 Y-08 的已核实源码部分**分账管理**；权重与模型文件在核实前禁止进入生产依赖，禁止下载进核心镜像
- **sourceAuditDate**：2026-09-27

#### U-03 · 其它尚未完成 lockfile/LICENSE 全量审计的依赖

- **license**：UNKNOWN
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定
- **dependencyRisk**：UNKNOWN
- **platformRisk**：UNKNOWN
- **classification**：`UNKNOWN`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：用于承接审计清单中未点名的其余依赖；完成 lockfile + LICENSE 全量审计后须拆分为具名条目，不得长期以集合形式存在
- **sourceAuditDate**：2026-09-27

#### U-04 · 未登记但已存在于传递依赖中的组件（兜底条目）

- **license**：UNKNOWN
- **commercialUse**：UNKNOWN
- **closedSourceAllowed**：UNKNOWN
- **licenseNoticeObligation**：未定
- **dependencyRisk**：UNKNOWN
- **platformRisk**：UNKNOWN
- **classification**：`UNKNOWN`
- **usageMode**：`REFERENCE_ONLY`
- **conditions**：兜底条款 —— 任何**未在 §2 具名登记**的 OSS 组件一律按 UNKNOWN 处理，新增前须先登记（Policy 硬规则 9）
- **sourceAuditDate**：2026-09-27

#### U-05 · email-verifier（**H1 一手证据修正项** · 准入状态 `NOT_APPROVED`）

- **project**：`email-verifier`（npm，upstream `whois-api-llc/node-email-verifier`，latest `0.4.1`，2018-12-04）
- **license**：`UNKNOWN`
- **commercialUse**：`UNKNOWN`
- **closedSourceAllowed**：`UNKNOWN`
- **licenseNoticeObligation**：未定 —— 许可证未核实，不产生可履行义务
- **dependencyRisk**：`UNKNOWN`
- **platformRisk**：`HIGH`（设计上要求内置 whoisxmlapi.com 商业付费 API key 并转发请求，与 Registry「不得内置第三方邮件服务凭证」约束正面冲突）
- **classification**：`UNKNOWN`
- **usageMode**：`REFERENCE_ONLY`
- **准入状态**：`NOT_APPROVED`
- **licenseEvidence**（一手证据，保留 H1 原始记录，**四项全挂**）：
  - npm manifest `email-verifier@0.4.1` → `license: "Unlicense"`（**不是 MIT**）；`0.1.0`–`0.4.1` 全为 `Unlicense`
  - 上游仓库 `whois-api-llc/node-email-verifier`：**无 `LICENSE` 文件**（`master/LICENSE` → `404`，`master/LICENSE.md` → `404`）
  - npm tarball（`0.3.0`/`0.4.0`/`0.4.1`）：**均不含 `LICENSE` 文件**
  - GitHub license API：`404 Not Found`（`license: null`）
- **conditions**：
  1. **禁止进入生产依赖**（Policy 硬规则 2）；仅允许 `REFERENCE_ONLY` 设计参考，不得复制代码。
  2. 不得以本条目替代 `G-02` 的旧 `MIT/GREEN` 结论 —— 该结论已作废。
  3. 若后续走 OSS 路线，须补齐：① 核实实际许可证；② 回填可追溯 `licenseEvidence`；③ 定唯一 `usageMode`；④ 补登传递依赖 `request@2.82.0` / `backoff`。补齐前保持 `UNKNOWN` / `NOT_APPROVED`。
  4. **不得标 `GREEN`**。
- **sourceAuditDate**：`2026-09-27`

> 证据来源：`docs/hunter/H1-OSS-AUDIT-EMAIL-VERIFIER.md`（H1 一轮 READ-ONLY 审计，结论 `OSS AUDIT = FAIL`）。
> 注：`request`（2019 起 deprecated）与 `backoff` 为 `email-verifier` 的传递依赖，**均未登记**（不在 `oss-01a-baseline.tsv`），受硬规则 9 约束。


### 2.5 pg-boss 直接依赖 + 传递依赖闭包（`T-03-xx` 子命名空间）

> **登记依据**：pg-boss 直接依赖与其传递依赖**必须继续登记**，
> **不得**当作 `GRANDFATHERED_BASELINE`（`oss-01a-baseline.tsv` 对 pg-boss 闭包 **0 命中**）。
> 全部 25 条属 `OSS-01A.4` 变更对象，须走 `OSS-01` ~ `OSS-10` 完整登记。
> `T-03-xx` 为 `G-03` 的子条目编号，不占 `G-0x`，不新增第二套 Registry。

**闭包实测**：`pg-boss@12.35.0` 传递依赖闭包 = **25 个传递依赖包**（实测，非推测）+ `pg-boss` 本体 = **26 条登记**。

| 层级 | 包 | license | 说明 |
| --- | --- | --- | --- |
| L0 | `pg-boss` | MIT | 本体（G-03） |
| L1 | `pg` `cron-parser` `rrule-temporal` `serialize-error` | MIT | 直接依赖 |
| L2/L3/L4 | `pgpass` `pg-pool` `pg-types` `pg-protocol` `pg-cloudflare` `pg-connection-string` `luxon` `temporal-spec` `non-error` `type-fest` `split2` `pg-int8` `pg-numeric` `postgres-date` `postgres-array` `postgres-bytea` `postgres-range` `postgres-interval` `tagged-tag` `obuf` `xtend`（21 项） | 见 §3 | 传递依赖 |

**4 项需单独记账（不得按「全 MIT」一笔带过）**：

| 标记 | 包 | 事实 | 处置 |
| --- | --- | --- | --- |
| ◆ | `temporal-spec` | **Apache-2.0**（非 MIT） | 触发 `OSS-05`：分发产物内须含 `LICENSE`；上游有 `NOTICE` 时产物内亦须含 |
| ▲ | `type-fest` | **`(MIT OR CC0-1.0)` 双许可** | **在 `conditions` 中明确选择 MIT license branch**（见下）；`OR` 不等于自动 MIT |
| ● | `split2` `pg-int8` `pg-numeric` | **ISC**（非 MIT） | 宽松、兼容；须保留版权与许可声明 |
| ☆ | `luxon@3.7.2` | 仓库 `pnpm-lock.yaml` **已有**（复用，不新增解析） | **仍须登记**为变更对象 |

#### T-03-14 · type-fest（双许可分支选定）

- **license**：`(MIT OR CC0-1.0)` → **选定 `MIT` 分支**
- **commercialUse**：`YES`
- **closedSourceAllowed**：`YES`
- **licenseNoticeObligation**：保留 MIT 版权与许可声明
- **classification**：`GREEN`
- **usageMode**：`DIRECT_REUSE`
- **licenseEvidence**：npm manifest `type-fest@5.10.0` → `license: "(MIT OR CC0-1.0)"`；tarball 内 `license-mit` + `license-cc0` 并存
- **conditions**：**明确选择 MIT license branch**（不使用 CC0 分支）；以 MIT 义务履约（保留版权与许可声明）。
- **sourceAuditDate**：`2026-09-27`

> 完整 26 行机读登记见 §3.1 `registry-tsv`（`G-03` + `T-03-01`…`T-03-25`）。

---

## 3. 机器可读摘要（用于 CI 解析）

> 供 CI/审核脚本以固定分隔符解析；每行一条，字段顺序固定：
> `id|project|license|commercialUse|closedSourceAllowed|dependencyRisk|platformRisk|classification|usageMode|sourceAuditDate`

```registry-tsv
G-01|e-commerce-agents|MIT|YES|YES|LOW|LOW|GREEN|CODE_EXTRACTION|2026-09-27
G-04|bullmq|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
G-05|opentelemetry-js|Apache-2.0|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
G-06|microsoft/agent-framework|MIT|YES|YES|LOW|LOW|GREEN|CODE_EXTRACTION|2026-09-27
Y-01|ShopeX/OMS|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|MEDIUM|YELLOW|REFERENCE_ONLY|2026-09-27
Y-02|laravel-ai-price-intelligence|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|LOW|YELLOW|REFERENCE_ONLY|2026-09-27
Y-03|keelead|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|MEDIUM|YELLOW|REFERENCE_ONLY|2026-09-27
Y-04|ProspectKit|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|MEDIUM|YELLOW|REFERENCE_ONLY|2026-09-27
Y-05|crawlee|Apache-2.0|YES|YES|MEDIUM|MEDIUM|YELLOW|ADAPTER|2026-09-27
Y-06|crawl4ai|Apache-2.0|YES|YES|MEDIUM|MEDIUM|YELLOW|SIDECAR|2026-09-27
Y-07|typescript-sdk|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|MEDIUM|YELLOW|REFERENCE_ONLY|2026-09-27
Y-08|ragflow|Apache-2.0|YES|YES|MEDIUM|MEDIUM|YELLOW|SIDECAR|2026-09-27
Y-09|1688-open-sdk-v2|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|HIGH|YELLOW|ADAPTER|2026-09-27
Y-10|pdd-node-sdk|UNKNOWN|UNKNOWN|UNKNOWN|MEDIUM|HIGH|YELLOW|ADAPTER|2026-09-27
R-01|customer-support-ai-employee|UNKNOWN|NO|NO|HIGH|HIGH|RED|REJECT|2026-09-27
R-02|reacherhq/check-if-email-exists|UNKNOWN|NO|NO|HIGH|HIGH|RED|REJECT|2026-09-27
R-03|langfuse(full-repo)|UNKNOWN|NO|NO|HIGH|HIGH|RED|REJECT|2026-09-27
R-04|xiaohongshu-mcp|UNKNOWN|NO|NO|HIGH|HIGH|RED|REJECT|2026-09-27
U-01|sentry/sentry|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|REFERENCE_ONLY|2026-09-27
U-02|ragflow-deepdoc-model-weights|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|REFERENCE_ONLY|2026-09-27
U-03|other-un-audited-deps|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|REFERENCE_ONLY|2026-09-27
U-04|unregistered-components-fallback|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|REFERENCE_ONLY|2026-09-27
U-05|email-verifier|UNKNOWN|UNKNOWN|UNKNOWN|UNKNOWN|HIGH|UNKNOWN|REFERENCE_ONLY|2026-09-27
```

### 3.1 pg-boss 直接 + 传递依赖闭包机读登记（26 行）

> 字段顺序同 §3（`id|project|license|commercialUse|closedSourceAllowed|dependencyRisk|platformRisk|classification|usageMode|sourceAuditDate`）。
> **共 26 行** = `G-03` 本体 1 + 传递依赖 `T-03-01`…`T-03-25`（25 行）。`T-03-xx` 为 `G-03` 子命名空间。

```registry-tsv
G-03|pg-boss|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-01|pg|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-02|cron-parser|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-03|rrule-temporal|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-04|serialize-error|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-05|pgpass|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-06|pg-pool|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-07|pg-types|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-08|pg-protocol|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-09|pg-cloudflare|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-10|pg-connection-string|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-11|luxon|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-12|temporal-spec|Apache-2.0|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-13|non-error|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-14|type-fest|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-15|split2|ISC|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-16|pg-int8|ISC|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-17|pg-numeric|ISC|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-18|postgres-date|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-19|postgres-array|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-20|postgres-bytea|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-21|postgres-range|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-22|postgres-interval|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-23|tagged-tag|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-24|obuf|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
T-03-25|xtend|MIT|YES|YES|LOW|LOW|GREEN|DIRECT_REUSE|2026-09-27
```

> `T-03-14`（`type-fest`）的 `license` 在 TSV 中取**选定后的 `MIT`**（不写 `(MIT OR CC0-1.0)`）；
> 分支选定依据见 §2.5「T-03-14 · type-fest（双许可分支选定）」。

---

---

## 4. 修订与登记流程

1. **申请**：在 Issue 中提出新增/变更依赖，指明 `project` 与用途。
2. **核实**：完成 LICENSE（非 README badge）、lockfile、传递依赖、平台条款四项核实。
3. **定级**：按 Policy 的判定规则给出 `classification` 与 `usageMode`。
4. **登记**：更新本文件 §2 与 §3 TSV，`sourceAuditDate` 更新为本次核实日期。
5. **生效**：条目合并后方可引入依赖；未登记即引入按 Policy 硬规则 9 阻断。

> 不得自行新增清单外项目，不得修改 Marvis 给出的风险等级；
> 定级变更须以审计结论为依据并在 Issue 留痕。

---

## 5. 变更记录

| 日期 | 版本 | 变更 | 依据 |
|---|---|---|---|
| 2026-09-27 | v1（draft） | 建立 Registry：24 条（GREEN 6 / YELLOW 10 / RED 4 / UNKNOWN 4）+ `registry-tsv` 机读锚点 | Marvis OSS/Platform Risk Audit |
| 2026-09-27 | v1 + `OSS-01A` | 新增 §0.1：明确 Registry 不承载存量冻结清单；差集公式改为三步排除；新增与 `oss-01a-baseline.tsv` 的回收关系 | 本 Issue 用户裁决 `OSS-01A` |
| 2026-09-27 | v1.1（R9 Closure） | ① `licenseEvidence` 提升为 §1 **通用字段**（+§1.3 语义）；② `email-verifier` 由 `GREEN` 降为 `UNKNOWN` / `REFERENCE_ONLY` / `NOT_APPROVED`（§2.4 `U-05`，保留 H1 一手证据）；③ `pg-boss` 收敛为 canonical（`GREEN` / `DIRECT_REUSE` / `MIT` / `closedSourceAllowed=YES` + `licenseEvidence`）；④ 新增 §2.5 + §3.1 pg-boss **直接 + 传递依赖闭包 26 行**登记（`T-03-xx`）；⑤ `type-fest` 在 `conditions` 明确选定 **MIT license branch** | St EM R9 Closure 指令 |
|---|---|

> 本文件**不含** Baseline 存量条目（见 `oss-01a-baseline.tsv`）。存量条目的回收须逐条走 §4 登记流程。

---

## 6. R9 Closure 状态

```
R9_STATUS = PASS
基线 = master 9efcb95916938399f13dba15093c3723195d17d3
Registry 载体 = docs/oss/ELARIS-OSS-REGISTRY.md（已随本 PR 进入主线）
```

| # | R9 前提 | 状态 |
| --- | --- | --- |
| P-1 | Registry 存在于基线 | ✅ 本 PR 将 `docs/oss/**` 4 文件迁入 master 主线 |
| P-2 | pg-boss 条目存在 | ✅ §2.1 `G-03`（canonical） |
| P-3 | 条目唯一（无双值） | ✅ `email-verifier` 旧 `G-02` 墓碑化并从 `registry-tsv` 移除 |
| P-4 | 直接 + 传递依赖全部登记 | ✅ §2.5 + §3.1：26 条（`G-03` 本体 1 + `T-03-01`…`T-03-25` 传递 25） |
| P-5 | 许可证实证可追溯 | ✅ `licenseEvidence` 为 §1 通用字段；`pg-boss` 三处一手同证 |
| P-6 | pg-boss 闭包**未**计入 `GRANDFATHERED_BASELINE` | ✅ `oss-01a-baseline.tsv` 对闭包 0 命中，全部为 `OSS-01A.4` 变更对象 |

**email-verifier 当前状态**：`license = UNKNOWN` · `classification = UNKNOWN` · `usageMode = REFERENCE_ONLY` · `NOT_APPROVED`（**不得标 `GREEN`**）。
**pg-boss 当前状态**：`GREEN` / `DIRECT_REUSE` / `MIT` / `closedSourceAllowed = YES` / 直接依赖 + 传递依赖共 26 条登记（1 + 25）。

---

## 7. 本轮未做的事（DESIGN_ONLY 自证）

- 未安装任何依赖（`node_modules` 0，未跑 installer）
- 未修改 `package.json` / `pnpm-lock.yaml` / 任何 lockfile
- 未写任何 TypeScript / JavaScript 业务代码
- 未修改 RFC-002
- 未直接 merge PR #7；仅提取 `docs/oss/**` 4 个正式文件到基于 master `9efcb95` 的新分支
- 未迁入 `schema.prisma.bak*` / `workforce-p04.tar` / 生产代码改动 / 其他技术债
- 未进入 H1.2 integration
