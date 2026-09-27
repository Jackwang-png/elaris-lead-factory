# OSS-01A · GRANDFATHERED_BASELINE 冻结清单（附录 A）

> 配套文件：`docs/oss/ELARIS-OSS-POLICY-v1.md`、`docs/oss/ELARIS-OSS-REGISTRY.md`
> 版本：`OSS-01A-v1`
> 冻结基准 commit：`85c9179160da1ea279da5cff4601d3dbd3143cfc`（master，chore(repo): establish monorepo baseline）
> 冻结基准日（baselineFrozenAt）：`2026-09-27`
> 状态：DESIGN + POLICY ONLY。本文件不引入任何第三方代码、不改业务代码、不改 DB、不执行 migration。

---

## A.0 本文件是什么

本文件是 Policy `OSS-01A` 的**执行载体**：把「本 Policy 首次启用时的仓库既有依赖」固定为一份可复核的快照，
使这批依赖**不因 Policy 首次启用而自动判为 `UNKNOWN`**。

- **机读来源（唯一）**：`docs/oss/oss-01a-baseline.tsv`（同目录），字段分隔符 `|`，编码 UTF-8。
- **本文件 = 人读解释 + 冻结边界声明**；发生冲突时以 Policy 条款为准。
- **Baseline 不是 LICENSE/版权/平台条款豁免**（Policy §OSS-01A.5）。

---

## A.1 冻结对象（三项齐备才构成 Baseline）

`GRANDFATHERED_BASELINE` 由以下三者**共同**冻结。缺任一项，本次启用不成立：

| # | 冻结对象 | 实测值（baseCommit `85c9179`） | 说明 |
|---|---|---|---|
| ① | **package manifests** | 6 个：根 / `apps/api` / `apps/dashboard` / `apps/mobile` / `apps/website` / `apps/widget` | 直接依赖声明的来源 |
| ② | **lockfiles** | 3 个：`pnpm-lock.yaml`(v9.0) / `apps/mobile/pnpm-lock.yaml`(v9.0) / `apps/website/package-lock.json`(v3) | 解析结果的来源 |
| ③ | **依赖解析结果** | 见 §A.4 解析结果指纹 | 决定 importer 集合与 resolved 版本 |

> **实测差异提醒**：仓库根目录**没有** `.cnb.yml`（已核实）。此前 Policy v1 §8「现有 `.cnb.yml` 位于根目录」的表述与实测不符，本文件为最新事实。

### A.1.1 manifest / lockfile 清单与内容指纹（SHA-256，可复核）

| 文件 | SHA-256 | 字节数 |
|---|---|---|
| `package.json` | `4e80a6c0c3dd0d5b3ba060c22f254c0f12e8f0d8e2a165719a607e088490fca8` | 370 |
| `pnpm-workspace.yaml` | `e9f33aa94f8c71a5fc0aebe02efcac601141719d0ad6eaeae08f3f01b5f90575` | 340 |
| `pnpm-lock.yaml` | `ca48eb7da6cfab155f53498b615bd70cf75bcfa0675c9123fd960e053a1b3997` | 308254 |
| `apps/api/package.json` | `a62d56d55269b232519f08e8caead957aac9cad80cb34dd8b9660eb97b453412` | 1644 |
| `apps/dashboard/package.json` | `3f82059cfb7f66f4ca6c327d6cde662e449933d8b99b83629a3ade922dce12e2` | 678 |
| `apps/mobile/package.json` | `ceb7e7a1911d36ff85d5d307969908b656a70366303adb6f2aa2bffe13e29e84` | 1348 |
| `apps/mobile/pnpm-lock.yaml` | `5372e58e22b06f50d6f2f0dba24523f19d164cfd92aa08aeb45aabb678c745cb` | 274635 |
| `apps/website/package.json` | `336d3177b13f597d570defd23dd0aef4fbaaeaf6d46fedcc0a2dc9105ebaf16b` | 457 |
| `apps/website/package-lock.json` | `dffa2181c109b9a199d20c7db27e2d51e8ead22de6890fd15f06772a150572ef` | 33841 |
| `apps/widget/package.json` | `f71a2e8ebabe5a2dc124098210bfca2357499b64d1d14bc5b3b573a390cf3b58` | 741 |

**指纹用途**：任一份 manifest/lockfile 的 SHA-256 发生变化 → 该文件对应的**增量部分**立即离开 Baseline，
按 Policy §OSS-01A.4 重新执行 `OSS-01` ~ `OSS-10`。指纹本身**不是**"许可证证明"。

---

## A.2 冻结范围（Baseline 内 / Baseline 外）

### A.2.1 在 Baseline 内（既有依赖）

以 baseCommit `85c9179` 的 **6 个 manifest × 3 个 lockfile** 解析出的**全部 importer 直接依赖**：

| 维度 | 实测 |
|---|---|
| importer 行数（package × app × kind） | **93** |
| 去重后的直接依赖包名 | **70** |
| 其中 `prod`（生产依赖）包名 | **48** |
| 其中 `dev` only 包名 | **22** |
| lockfile 内传递依赖包名（根 lock 解析） | 834 |
| importer 分布 | `apps/api` 39 · `apps/dashboard` 16 · `apps/mobile` 15 · `apps/widget` 15 · `apps/website` 8 |

逐行清单见 **`docs/oss/oss-01a-baseline.tsv`**（93 行，字段 `id|package|kind|app|specifier|resolved|classification|registered`）。

### A.2.2 在 Baseline 外（必须重新执行 OSS-01 ~ OSS-10）

1. **新增直接依赖**（任何 importer 新增 `package.json` 依赖项）
2. **升级 / 替换现有依赖**（含 `resolved` 版本变化、`specifier` 变化、包名替换、`overrides`/`resolutions` 变更）
3. **改变 `usageMode`**（如 `REFERENCE_ONLY` → 任何其他形态）
4. **从 `REFERENCE_ONLY` 转为 `CODE_EXTRACTION` / `DIRECT_REUSE`**
5. **引入第三方源码复制或大段改编**（含从既有依赖的源码里摘取片段）
6. **引入新的平台自动化能力**（Cookie/登录态自动化、新增平台开放接口调用、新增 webhook 出站动作）

> 上述 6 类命中任一项 → **该变更对象**离开 Baseline，不是整仓离开。

### A.2.3 明确豁免范围（不触发重新登记）

以下**不**构成「新增依赖」，不触发 OSS-01 ~ OSS-10：

- 传递依赖的**非直接**版本漂移（由 lockfile 重解析自然产生，且未被 6 类命中）
- 纯 `devDependencies` 的新增且**不进入产品产物**、不进入 CI 产物（Policy §1 简化流程，仍须在 Registry 留痕）
- 注释、文档、测试文件改动

---

## A.3 Baseline 内既有依赖的判定语义（关键）

```
既有依赖（Baseline 内）的 classification = GRANDFATHERED_NOT_AUDITED
```

**语义边界（四条，缺一不可）**：

| # | 规则 |
|---|---|
| 1 | `GRANDFATHERED_NOT_AUDITED` **不等于** `GREEN` |
| 2 | `GRANDFATHERED_NOT_AUDITED` **不等于**免检：它只是「首次启用不阻断」，不构成任何许可结论 |
| 3 | 它**不因** Policy 首次启用而自动判为 `UNKNOWN`（这正是 `OSS-01A` 的目的） |
| 4 | 它**不免除** OSS-03（UNKNOWN 不进生产依赖）之外的其他义务：`OSS-05`/`OSS-06`/`OSS-07` 对**已确认许可证类别**的条目仍然照常适用 |

**与 OSS-01 / OSS-03 / U-04 的字面冲突如何消除**（本条款的核心）：

| 原文条款 | 原文口径 | `OSS-01A` 下的最终口径 |
|---|---|---|
| `OSS-01` 依赖均已登记 | 差集非空即阻断 | 差集计算时**排除 Baseline 集合**：`未登记集合 = 全部依赖 − Registry 已登记 − Baseline 集合` |
| `OSS-03` UNKNOWN 不进生产依赖 | `dependencies` 中无 `UNKNOWN` | `GRANDFATHERED_NOT_AUDITED` **不计入** `UNKNOWN`；仅 `classification = UNKNOWN` 计入 |
| `U-04` 未登记兜底按 UNKNOWN | 未登记 → 一律 UNKNOWN | 兜底**不适用于** Baseline 集合；仅适用于 Baseline 外的新增/变更对象 |
| 硬规则 2（UNKNOWN 禁入生产依赖） | 字面适用 | 对 Baseline 集合**不适用**；对 6 类变更对象**完整适用** |

---

## A.4 依赖解析结果指纹（解析器与范围）

| 项 | 值 |
|---|---|
| Base commit | `85c9179160da1ea279da5cff4601d3dbd3143cfc` |
| Base commit 日期 | 2026-09-24 17:41:09 +0800 |
| 主 lockfile | `pnpm-lock.yaml`，`lockfileVersion: '9.0'`，9095 行，importers = `.`（空）/ `apps/api` / `apps/dashboard` / `apps/widget` |
| mobile lockfile | `apps/mobile/pnpm-lock.yaml`，`lockfileVersion: '9.0'`，6383 行 |
| website lockfile | `apps/website/package-lock.json`，`lockfileVersion: 3`，60 个 `packages` 条目，1046 行 |
| 解析器 | lockfile 的 `importers` 段 + 各 `package.json` 交叉核对（双源一致性） |

### A.4.1 实测不一致（必须记录，本版不改）

| # | 事实 | 影响 | 本版处置 |
|---|---|---|---|
| I-1 | 根 `pnpm-workspace.yaml` 声明 `apps/*` + `packages/*`，但根 lockfile 的 `importers` **只有 3 个**：`apps/api`、`apps/dashboard`、`apps/widget`。**`apps/mobile` 与 `apps/website` 不在根 lock 内** | 根 lock 不能作为全仓唯一依赖事实源 | 各自读取其独立 lockfile |
| I-2 | 仓库根**无 `.cnb.yml`** | Policy v1 §8 相关表述过时 | 记为待修订 |
| I-3 | `packages/*` 目录**当前不存在** | `OSS-02`/`OSS-04` 的 `packages/*/src` 扫描路径当前为空集 | 保留路径，命中为空不算通过 |
| I-4 | `apps/api/package.json` 把 `@types/express`、`@types/socket.io`、`@types/uuid` 放在 **`dependencies`** | 会被 `OSS-03` 当作生产依赖扫描 | 原样冻结，不在本版修正 |

> 依据 Policy：依赖集合的判定以 **lockfile 解析结果**为准；manifest 与 lockfile 冲突时**以 lockfile 为准**并记录为不一致项。

---

## A.5 Baseline 不是豁免（红线复述，与 Policy 逐字一致）

`GRANDFATHERED_BASELINE` **不是**许可证、Copyright 或平台条款豁免。具体地：

1. Baseline 内条目**不因入表**而获得任何 `license` / `commercialUse` / `closedSourceAllowed` 结论；
2. `GRANDFATHERED_NOT_AUDITED` 不得被任何下游角色（CodeBuddy / Marvis / OpenCode / CI）当作 `GREEN` 使用；
3. 一旦发现 Baseline 内条目**实际存在不具备合法使用基础的证据**（含：无 LICENSE、许可证禁止商用、平台条款禁止该用途、Cookie/登录态自动化产品化），该条目**立即**进入 `REVIEW` / `SUSPEND` 流程（见 Policy §OSS-01A.6）；
4. 进入 `REVIEW`/`SUSPEND` 的条目**同时**从 Baseline 冻结清单移出（其 `GRANDFATHERED_NOT_AUDITED` 状态撤销）。

---

## A.6 强制触发重新审计的 6 类变更（与 Policy §OSS-01A.4 对照）

| # | 触发条件（用户条款） | 机器判定方式 | 需执行 | 阻断级别 |
|---|---|---|---|---|
| 1 | 新增直接依赖 | manifest diff 中 `dependencies`/`devDependencies`/`optionalDependencies` 出现新 key | OSS-01 ~ OSS-10 | 阻断 |
| 2 | 升级 / 替换现有依赖 | 同一 key 的 `resolved` 变化，或 key 改名，或 lockfile `overrides` 变化 | OSS-01 ~ OSS-10 | 阻断 |
| 3 | 改变 `usageMode` | 条目实际用法超出 Registry `usageMode` 允许集合 | OSS-01 ~ OSS-10 + `OSS-11` | 阻断 |
| 4 | `REFERENCE_ONLY` → `CODE_EXTRACTION`/`DIRECT_REUSE` | 条目由"仅参考"变为"进核心/进依赖" | OSS-01 ~ OSS-10 + `OSS-11` | 阻断 |
| 5 | 引入第三方源码复制 / 大段改编 | 核心目录出现上游特征文件、版权头、导入路径、相似片段 | OSS-01 ~ OSS-10 + `OSS-04`/`OSS-05`/`OSS-06` | 阻断 |
| 6 | 引入新的平台自动化能力 | 新增平台 API 调用 / 新增 Cookie/登录态路径 / 新增 webhook 出站动作 | OSS-01 ~ OSS-10 + `OSS-09` | 阻断（`OSS-09` 为告警+人工复核，其余阻断） |

> **判定以"变更对象"为单位**：命中 1 类即对该对象执行全量 OSS-01 ~ OSS-10，不对整仓重跑。

---

## A.7 Baseline 内条目的处置路径（不要求一次性完成登记）

```
Baseline 内既有依赖（GRANDFATHERED_NOT_AUDITED）
        │
        ├─ ① 默认：不阻断 CI，不要求本周期完成登记
        │
        ├─ ② 被 6 类变更命中 → 离开 Baseline → 走 OSS-01 ~ OSS-10
        │
        ├─ ③ 被后续审计轮次核实 → 补登 Registry（11 字段）→ classification 落地
        │        核实顺序建议：先 prod（48）后 dev（22）；先 api 后 web
        │
        └─ ④ 发现"不具备合法使用基础"的证据 → REVIEW / SUSPEND（立即）
```

**节流要求**：`GRANDFATHERED_NOT_AUDITED` 是**过渡态**，不是终态。
建议每次审计轮次固定回收 ≥5 条（优先 `prod` + 平台相关），直到归零。

---

## A.8 机读锚点

- **唯一机读来源**：`docs/oss/oss-01a-baseline.tsv`
- 字段顺序固定：`id|package|kind|app|specifier|resolved|classification|registered`
- 字段数与取值域：

| 字段 | 取值域 |
|---|---|
| `id` | `B-\d{3}` |
| `package` | 非空字符串（npm 包名，含 scope） |
| `kind` | `prod` / `dev` / `optional` |
| `app` | `apps/api` / `apps/dashboard` / `apps/mobile` / `apps/website` / `apps/widget` / `.` |
| `specifier` | manifest 原文 |
| `resolved` | lockfile 解析结果；无法解析写 `?` |
| `classification` | 本版恒为 `GRANDFATHERED_NOT_AUDITED` |
| `registered` | `NO`（本基线不做 Registry 登记） |

- 与 Registry §3 `registry-tsv` 的关系：**两套独立锚点**。
  `OSS-01` 差集计算的正确顺序：
  ```
  未登记集合 = 全部依赖
             − Registry.registry-tsv 的 project 集合
             − oss-01a-baseline.tsv 的 package 集合
  ```

---

## A.9 变更记录

| 日期 | 变更 | 依据 |
|---|---|---|
| 2026-09-27 | 建立 `OSS-01A` 执行载体；冻结 93 行 / 70 包 Baseline；输出 10 项 manifest/lockfile 指纹 | 本 Issue 用户裁决 |

---

## A.10 DESIGN_ONLY 结论

- 本文件 + `oss-01a-baseline.tsv` 为 `DESIGN + POLICY` 交付物。
- **未引入任何第三方源码或依赖**；未改业务代码、未改 DB、未执行 migration。
- 冻结清单由 baseCommit `85c9179` 的 manifest + lockfile **实测解析**得出，非人工估列。
- `GRANDFATHERED_BASELINE` 为**过渡态**；`GRANDFATHERED_NOT_AUDITED` 不得被当作 `GREEN`。
