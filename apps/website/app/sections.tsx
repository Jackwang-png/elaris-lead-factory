import Reveal from "./Reveal";
import {
  Brain,
  MessageSquareText,
  BarChart3,
  ShoppingBag,
  PackageSearch,
  Smartphone,
  Headphones,
  Boxes,
  ShieldCheck,
  Zap,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Globe,
  type LucideIcon,
} from "lucide-react";

/* ----------------------------- Hero ----------------------------- */
export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container">
        <div className="hero-badge">
          <span className="badge badge-accent">
            <Sparkles size={13} /> 电商 AI 员工
          </span>
        </div>
        <h1>
          让 AI 成为你的<span className="text-gradient"> 电商员工</span>
        </h1>
        <p>
          WANLAN AI（万澜）把客服、分析、订单与库存的重复工作交给 AI，
          让商家专注经营决策。一个 AI 员工，覆盖电商日常。
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#cta">
            免费试用 <ArrowRight size={16} />
          </a>
          <a className="btn btn-ghost" href="#product">
            看产品演示
          </a>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="num text-gradient">7×24</div>
            <div className="lbl">自动值守，不漏单</div>
          </div>
          <div className="hero-stat">
            <div className="num text-gradient">多渠道</div>
            <div className="lbl">咨询统一接入</div>
          </div>
          <div className="hero-stat">
            <div className="num text-gradient">移动 + 桌面</div>
            <div className="lbl">随时协同经营</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------- AI 员工（产品） ----------------------- */
export function Product() {
  return (
    <section className="section" id="product">
      <div className="container">
        <Reveal>
          <div className="eyebrow">AI 员工</div>
          <h2 className="section-title">一个 AI 员工，覆盖电商日常</h2>
          <p className="section-sub">
            不是又一个聊天机器人。WANLAN AI 以「员工」的角色进入经营：
            读懂订单、库存与数据，主动提醒、自动处理、必要时转人工。
          </p>
        </Reveal>

        <div className="grid grid-3" style={{ marginTop: "var(--space-6)" }}>
          <Feature icon={MessageSquareText} title="智能客服" desc="秒级响应常见咨询，自动归类意图，复杂问题平滑转人工。" />
          <Feature icon={BarChart3} title="经营分析" desc="GMV、转化、库存周转用一句话问出来，结果可解释。" />
          <Feature icon={ShoppingBag} title="订单助手" desc="查单、跟单、异常订单提醒，减少人工翻查。" />
          <Feature icon={PackageSearch} title="库存洞察" desc="低库存、缺货提前预警，避免断货与积压。" />
          <Feature icon={Headphones} title="人工接管" desc="AI 处理不了的，带着完整上下文交给你或团队。" />
          <Feature icon={Smartphone} title="移动协同" desc="手机上也能问经营、看预警、处理待办。" />
        </div>

        <Reveal delay={80} className="hero-visual">
          <div className="mock">
            <span className="example-tag">界面示例 · 示例数据</span>
            <div className="mock-bar">
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span style={{ marginLeft: 8, color: "var(--text-secondary)", fontSize: 13 }}>AI 员工 · 今日待办</span>
            </div>
            <div className="mock-body">
              <div className="mock-row"><span className="t">库存预警</span><span className="s badge badge-warning">3 件低库存</span></div>
              <div className="mock-row"><span className="t">待人工</span><span className="s badge badge-danger">2 条</span></div>
              <div className="mock-row"><span className="t">今日支付订单</span><span className="s">128 笔</span></div>
              <div className="mock-row"><span className="t">异常订单</span><span className="s badge badge-neutral">0 笔</span></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- 智能客服 --------------------------- */
export function CustomerService() {
  return (
    <section className="section-tight" id="service">
      <div className="container">
        <div className="grid grid-2" style={{ alignItems: "center" }}>
          <Reveal>
            <div className="eyebrow">智能客服</div>
            <h2 className="section-title">把重复咨询，交给 AI</h2>
            <p className="section-sub">
              售前问答、物流查询、退换货指引——AI 即时响应，
              识别意图后自动处理；遇到权限或高风险事项，带着对话上下文转人工。
            </p>
            <ul style={{ marginTop: "var(--space-5)", display: "grid", gap: 12 }}>
              <Check text="多渠道咨询统一到一个工作台" />
              <Check text="知识库驱动的准确回答，减少幻觉" />
              <Check text="敏感操作始终保留人工确认" />
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <div className="mock">
              <span className="example-tag">界面示例 · 示例对话</span>
              <div className="mock-body">
                <div className="chat-demo">
                  <div className="bubble-user">我的订单到哪了？</div>
                  <div className="bubble-ai">
                    已为您查询：订单 #2026-0912-8841 于今日 09:20 由顺丰揽收，预计明日送达。需要我帮您开启签收提醒吗？
                  </div>
                  <div className="bubble-user">好的，开启提醒</div>
                  <div className="bubble-ai">已设置。如有异常我会第一时间通知您。</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 经营分析 --------------------------- */
export function BusinessIntelligence() {
  return (
    <section className="section-tight" id="bi">
      <div className="container">
        <Reveal>
          <div className="eyebrow">经营分析</div>
          <h2 className="section-title">用一句话，看清经营</h2>
          <p className="section-sub">不堆图表。问「今天卖得最好的是什么」，AI 直接给结论与依据。</p>
        </Reveal>
        <div className="grid grid-4" style={{ marginTop: "var(--space-6)" }}>
          <div className="stat"><div className="num text-gradient">¥ 86.4k</div><div className="lbl">今日 GMV（示例）</div></div>
          <div className="stat"><div className="num text-gradient">+12.3%</div><div className="lbl">环比（示例）</div></div>
          <div className="stat"><div className="num text-gradient">3.8%</div><div className="lbl">转化率（示例）</div></div>
          <div className="stat"><div className="num text-gradient">2</div><div className="lbl">待人工（示例）</div></div>
        </div>
        <Reveal delay={80} className="hero-visual">
          <div className="mock">
            <span className="example-tag">界面示例 · 示例数据</span>
            <div className="mock-body">
              <div className="mock-row"><span className="t">问：本周复购率如何？</span></div>
              <div className="mock-row"><span className="s" style={{ color: "var(--text-secondary)" }}>
                AI：本周复购率 18.6%，较上周 +2.1pt，主要来自「会员专享」活动。建议对未复购新客推送召回券。
              </span></div>
              <div className="mock-row"><span className="s badge badge-neutral">结论基于示例数据</span></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------- 订单 ----------------------------- */
export function Orders() {
  return (
    <section className="section-tight" id="orders">
      <div className="container">
        <div className="grid grid-2" style={{ alignItems: "center" }}>
          <Reveal>
            <div className="eyebrow">订单管理</div>
            <h2 className="section-title">订单，一眼掌握</h2>
            <p className="section-sub">
              状态、金额、物流、异常集中呈现。AI 帮忙标记风险订单，
              你只需处理真正需要决策的部分。
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="mock">
              <span className="example-tag">界面示例 · 示例数据</span>
              <div className="mock-body">
                <div className="mock-row"><span className="t">#2026-0912-8841</span><span className="s badge badge-success">已发货</span></div>
                <div className="mock-row"><span className="t">#2026-0912-8837</span><span className="s badge badge-warning">待付款</span></div>
                <div className="mock-row"><span className="t">#2026-0912-8820</span><span className="s badge badge-danger">退款中</span></div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- 库存 ----------------------------- */
export function Inventory() {
  return (
    <section className="section-tight" id="inventory">
      <div className="container">
        <Reveal>
          <div className="eyebrow">库存预警</div>
          <h2 className="section-title">让异常，先被你看见</h2>
          <p className="section-sub">低库存、缺货、周转异常实时高亮，避免在断货后才发现。</p>
        </Reveal>
        <div className="grid grid-2" style={{ marginTop: "var(--space-6)" }}>
          <div className="mock">
            <span className="example-tag">界面示例 · 示例数据</span>
            <div className="mock-body">
              <div className="mock-row"><span className="t">便携收纳袋 · M</span><span className="s badge badge-warning">剩 4 件</span></div>
              <div className="mock-row"><span className="t">无线充电器 20W</span><span className="s badge badge-danger">缺货</span></div>
              <div className="mock-row"><span className="t">礼盒包装 L</span><span className="s badge badge-warning">剩 6 件</span></div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, alignContent: "center" }}>
            <Feature icon={AlertTriangle} title="低库存预警" desc="低于阈值自动提醒，补货不靠记忆。" />
            <Feature icon={PackageSearch} title="缺货一目了然" desc="缺货商品置顶高亮，优先处理。" />
            <Feature icon={TrendingUp} title="周转洞察" desc="滞销与热销对比，优化进货。" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 移动端 --------------------------- */
export function MobileApp() {
  return (
    <section className="section-tight" id="mobile">
      <div className="container">
        <div className="grid grid-2" style={{ alignItems: "center" }}>
          <Reveal>
            <div className="eyebrow">移动端 App</div>
            <h2 className="section-title">经营，装进口袋</h2>
            <p className="section-sub">
              手机上问 AI、看今日经营、处理待人工与库存预警。
              出门也能掌握店铺。
            </p>
            <ul style={{ marginTop: "var(--space-5)", display: "grid", gap: 12 }}>
              <Check text="首页一眼看懂今天经营得怎么样" />
              <Check text="AI 是核心页，随时提问与追问" />
              <Check text="订单 / 库存 / 客户 / 待人工随身处理" />
            </ul>
            <div className="hero-actions" style={{ marginTop: "var(--space-5)" }}>
              <a className="btn btn-primary" href="#cta">了解移动端</a>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="mock" style={{ maxWidth: 320, margin: "0 auto" }}>
              <span className="example-tag">界面示例 · 示例数据</span>
              <div className="mock-body" style={{ gap: 12 }}>
                <div className="mock-row"><span className="t">下午好，店铺</span></div>
                <div className="mock-row"><span className="t">今日 GMV</span><span className="s">¥ 86.4k</span></div>
                <div className="mock-row"><span className="t">待人工</span><span className="s badge badge-danger">2</span></div>
                <div className="mock-row"><span className="t">低库存</span><span className="s badge badge-warning">3</span></div>
                <div className="bubble-ai" style={{ maxWidth: "100%" }}>
                  今天经营不错，但「无线充电器 20W」已缺货，建议优先补货。
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------- 人工接管 -------------------------- */
export function HumanHandoff() {
  return (
    <section className="section-tight" id="handoff">
      <div className="container">
        <Reveal>
          <div className="eyebrow">人工接管</div>
          <h2 className="section-title">AI 处理不了的，交给你</h2>
          <p className="section-sub">
            当对话涉及权限、退款确认或高情绪客户，AI 带着完整上下文发起接管。
            当前版本为只读接管视图：你能看到等待时长、渠道与最后一条消息，
            真实处理由对应后台完成。
          </p>
          <div className="notice" style={{ marginTop: "var(--space-4)" }}>
            <ShieldCheck size={14} /> 当前版本：只读接管视图，不修改业务数据
          </div>
        </Reveal>
        <Reveal delay={80} className="hero-visual">
          <div className="mock">
            <span className="example-tag">界面示例 · 示例数据</span>
            <div className="mock-body">
              <div className="mock-row"><span className="t">等待 4 分 · 微信</span><span className="s badge badge-warning">退款确认</span></div>
              <div className="mock-row"><span className="t">最后消息：协商部分退款</span></div>
              <div className="mock-row"><span className="s badge badge-neutral">只读 · 待处理</span></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- 生态 --------------------------- */
export function Ecosystem() {
  const planned: { icon: LucideIcon; name: string }[] = [
    { icon: Globe, name: "主流电商平台（规划中）" },
    { icon: Boxes, name: "ERP / 仓储（规划中）" },
    { icon: ShoppingBag, name: "商城系统（规划中）" },
    { icon: Zap, name: "营销工具（规划中）" },
  ];
  return (
    <section className="section-tight" id="ecosystem">
      <div className="container">
        <Reveal>
          <div className="eyebrow">电商生态</div>
          <h2 className="section-title">标准适配器，面向未来生态</h2>
          <p className="section-sub">
            WANLAN AI 采用统一的 Provider / Adapter 架构：
            接入新的电商或 ERP 平台时，只需新增一个适配器，
            业务模型保持不变。具体平台对接将随版本逐步开放。
          </p>
        </Reveal>
        <div className="grid grid-4" style={{ marginTop: "var(--space-6)" }}>
          {planned.map((p) => (
            <div key={p.name} className="feature" style={{ textAlign: "center" }}>
              <div className="ico" style={{ margin: "0 auto var(--space-3)" }}><p.icon size={20} /></div>
              <h3 style={{ fontSize: 15 }}>{p.name}</h3>
              <div style={{ marginTop: 8 }}><span className="badge badge-neutral">即将开放</span></div>
            </div>
          ))}
        </div>
        <div className="notice" style={{ marginTop: "var(--space-5)" }}>
          <Sparkles size={14} /> 持续接入更多电商生态
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- CTA ----------------------------- */
export function CTA() {
  return (
    <section className="section-tight" id="cta">
      <div className="container">
        <Reveal>
          <div className="cta">
            <div className="eyebrow" style={{ justifyContent: "center" }}>开始使用</div>
            <h2>让 AI 成为你的电商员工</h2>
            <p>从今天起，把重复工作交给 WANLAN AI，把时间还给经营。</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#mobile">
                了解移动端 <ArrowRight size={16} />
              </a>
              <a className="btn btn-ghost" href="#top">
                回到顶部
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- 小组件 --------------------------- */
function Feature({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="feature">
      <div className="ico"><Icon size={20} /></div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
      <CheckCircle2 size={18} color="var(--success)" />
      <span>{text}</span>
    </li>
  );
}
