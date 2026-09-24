"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Bot, Plus } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function BotsPage() {
  const [bots, setBots] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", model: "deepseek-chat", systemPrompt: "你是一个专业客服",
  });
  const [loading, setLoading] = useState(true);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  async function load() {
    try {
      const res = await axios.get(`${API}/bots`, { headers: headers() });
      setBots(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name) return;
    try {
      await axios.post(`${API}/bots`, form, { headers: headers() });
      setShow(false);
      setForm({ name: "", description: "", model: "deepseek-chat", systemPrompt: "你是一个专业客服" });
      load();
    } catch (e) { alert("创建失败"); }
  }

  async function remove(id: string) {
    if (!confirm("确定删除这个助手？")) return;
    try {
      await axios.delete(`${API}/bots/${id}`, { headers: headers() });
      load();
    } catch (e) { alert("删除失败"); }
  }

  return (
    <div className="fade-in-up">
      <style>{`
        @keyframes modalIn { 0% { opacity: 0; transform: scale(0.94) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes backdropIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        .modal-backdrop { animation: backdropIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .modal-panel { animation: modalIn 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .icon-box {
          width: 44px; height: 44px; border-radius: var(--radius-lg);
          display: grid; place-items: center;
          background: var(--accent-soft); border: 1px solid rgba(59, 130, 246, 0.18);
          color: var(--accent); flex-shrink: 0;
        }
        .danger-btn-sm {
          background: var(--danger-soft); color: var(--danger);
          border: 1px solid rgba(248, 113, 113, 0.18);
          border-radius: var(--radius-md); padding: 6px 12px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: background var(--transition-fast);
        }
        .danger-btn-sm:hover { background: rgba(248, 113, 113, 0.18); }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">Automation</div>
          <h1>助手管理</h1>
          <p className="page-subtitle">创建和管理您的客服助手，配置模型与系统提示</p>
        </div>
        <button className="btn-primary" onClick={() => setShow(true)}>
          <Plus size={15} strokeWidth={2.2} /> 创建助手
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-icon"><Bot size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取助手列表</div>
        </div>
      ) : bots.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-icon"><Bot size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">还没有助手</div>
            <div className="empty-desc">点击右上角"创建助手"，马上开始配置客服</div>
            <button className="btn-primary" style={{ marginTop: 18 }} onClick={() => setShow(true)}>
              <Plus size={15} strokeWidth={2.2} /> 创建第一个助手
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {bots.map((bot) => (
            <div key={bot.id} className="card" style={{ padding: 22 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
                <div className="icon-box"><Bot size={22} strokeWidth={1.7} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.2, lineHeight: 1.3 }}>
                      {bot.name}
                    </div>
                    <button className="danger-btn-sm" onClick={() => remove(bot.id)}>删除</button>
                  </div>
                </div>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0, marginBottom: 14, lineHeight: 1.6 }}>
                {bot.description || "暂无描述"}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge badge-success">{bot.model || "deepseek-chat"}</span>
                <span className="badge badge-info">在线</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {show && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "saturate(180%) blur(14px)",
            WebkitBackdropFilter: "saturate(180%) blur(14px)",
            display: "grid", placeItems: "center",
            zIndex: 100, padding: 20,
          }}
          onClick={() => setShow(false)}
        >
          <div
            className="modal-panel"
            style={{
              background: "var(--bg-card)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-lg)",
              padding: 28, width: "100%", maxWidth: 460, maxHeight: "90vh", overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 22 }}>
              <div className="page-eyebrow">New Assistant</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: "var(--text-primary)", margin: "8px 0 0" }}>创建助手</h2>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>助手名称</label>
              <input style={{ width: "100%" }} placeholder="如：小蓝客服" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>描述</label>
              <input style={{ width: "100%" }} placeholder="如：负责售前咨询" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>模型</label>
              <select style={{ width: "100%" }} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
              </select>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>系统提示词</label>
              <textarea style={{ width: "100%", height: 110, resize: "none" }} placeholder="告诉助手怎么服务客户" value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={create}>保存</button>
              <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setShow(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
