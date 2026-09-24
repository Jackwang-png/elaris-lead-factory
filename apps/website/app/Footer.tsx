import { Sparkles } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <a className="brand" href="#top" style={{ marginBottom: 12 }}>
              <span className="brand-mark">W</span>
              WANLAN AI
            </a>
            <p style={{ color: "var(--text-tertiary)", fontSize: 14, maxWidth: "34ch", marginTop: 12 }}>
              万澜 · 电商 AI 员工。让 AI 真正进入电商经营，把重复工作交给 AI，把决策留给商家。
            </p>
          </div>

          <div>
            <h4>产品</h4>
            <a href="#product">AI 员工</a>
            <a href="#service">智能客服</a>
            <a href="#bi">经营分析</a>
            <a href="#orders">订单管理</a>
            <a href="#inventory">库存预警</a>
          </div>

          <div>
            <h4>协同</h4>
            <a href="#mobile">移动端 App</a>
            <a href="#handoff">人工接管</a>
            <a href="#ecosystem">电商生态</a>
          </div>

          <div>
            <h4>公司</h4>
            <a href="#cta">免费试用</a>
            <a href="#top">关于万澜</a>
            <a href="#top">联系我们</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} WANLAN AI（万澜）. 保留所有权利。</span>
          <span className="notice">
            <Sparkles size={13} /> 持续接入更多电商生态
          </span>
        </div>
      </div>
    </footer>
  );
}
