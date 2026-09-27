# HUNTER Intelligence V1.4 — Third-Party OSS Notices

本目录下 Hunter V1.4 相关模块（`hunter.types.ts` / `hunter.constants.ts` / `buying-signals.ts` /
`pain-signals.ts` / `sales-readiness.ts` / `sales-recommendation.ts` / `hunter.assessment.ts`）为
ELARIS 独立编写（TypeScript），**未复制任何第三方仓库的源代码**。

实现过程中参考了以下 MIT 授权项目的**架构思路与规则模式**（仅概念级借鉴，未搬运代码）：

## 1. samiyashahzad/lead-score-agent (LeadScout) — DIRECT_REUSE（算法/schema 模式级）

- License: MIT
- Copyright: `Copyright (c) 2026 Sophie`
- License evidence: `LICENSE`（仓库根，MIT 全文，SPDX: MIT），commit `3f0dcb9`
- 借鉴内容（概念层）：
  - 三阶段流水线分离：信号提取 → 确定性评分 → 解释生成；
  - 评分引擎作为不可被 LLM 覆盖的 chokepoint（本实现对应 `HUNTER_READINESS` 加权与 `buildSalesRecommendationRules`）；
  - `priority threshold`（Hot/Warm/Cold）阈值式分层 → 本实现 `HUNTER_BUYING_TIERS` / `STATE_THRESHOLDS`；
  - `confidence` 作为“数据完整度”而非概率 → 本实现 `confidence = 命中规则数 / 规则总数`；
  - LLM 输出字段级回退（field-level fallback）与“解释不得改写既定分数”约束 → 本实现 `SalesAnglePort` + `isAcceptableAngle` 白名单。
- 未使用其代码、依赖（FastAPI / Pydantic / Groq / openai-python）或运行时。

## 2. 其他参考项目（REFERENCE_ONLY，未纳入任何实现）

| Repo | License | Commit/Tag | 仅参考的方面 |
|---|---|---|---|
| zebangeth/ProspectKit | MIT | `8292458` | 信号 taxonomy 分层（capability / intent / timing） |
| chaitanyya/sales | MIT | `v0.2.1` (`8c6f843`) | next-action 与 why-now 的表达结构 |
| LeadMagic/gtm-skills | MIT | `48a4de8` | 信号权重与分层阈值思路 |
| koinod/koino-skills | MIT | `cfeeeea` | 销售动作编排表达 |
| xeneta/LeadQualifier | MIT | `931fa2f` | 资格规则（规则式，非其 ML 实现） |
| VictorValar/generic-lead-scoring-model | MIT | `e118056` | 加权评分模板 |

上述项目的代码、模型、数据集、依赖均未进入本仓库。

## 3. 义务声明

- 无新增 npm / Python 依赖，无 submodule，无 vendor 目录；
- 无 copyleft（GPL/AGPL/BSL/SSPL）代码进入本仓库；
- 如后续决定复制上述任一项目的实质代码片段，必须重新走 OSS 使用审批并在此文件补充完整 MIT 许可文本与版权行。
