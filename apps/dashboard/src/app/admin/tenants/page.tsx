"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Search, Building2, Users as UsersIcon, Bot, UsersRound, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function AdminTenants() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  function fetchTenants(p = page, q = search) {
    setLoading(true);
    const token = localStorage.getItem("token");
    axios
      .get(`${API}/admin/tenants`, {
        params: { page: p, limit: 20, search: q },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setTenants(res.data.items || []);
        setTotal(res.data.total || 0);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchTenants(); }, []);

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Tenant Management</div>
          <h1>商家管理</h1>
          <p className="page-subtitle">管理平台入驻商家、查看各租户运营数据</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px", background: "var(--bg-surface)",
          border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
          transition: "all var(--transition-base)", flex: "1 1 280px", maxWidth: 420,
        }}>
          <Search size={16} strokeWidth={1.8} color="var(--text-tertiary)" />
          <input
            placeholder="搜索商家名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); fetchTenants(1, search); } }}
            style={{ background: "transparent !important", border: "none !important", outline: "none !important", padding: "10px 0", fontSize: 13.5, flex: 1, boxShadow: "none !important", minWidth: 0 }}
          />
        </div>
        <button className="btn-primary" onClick={() => { setPage(1); fetchTenants(1, search); }}>
          <Search size={14} strokeWidth={2} />
          搜索
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                {["商家名称", "用户数", "助手数", "客户数", "创建时间"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 30, height: 30, borderRadius: "var(--radius-md)",
                        background: "var(--accent-soft)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--accent)", flexShrink: 0,
                      }}>
                        <Building2 size={15} strokeWidth={1.8} />
                      </span>
                      {t.name}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <UsersIcon size={13} strokeWidth={1.8} color="var(--info)" />
                      <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t._count?.users ?? 0}</span>
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Bot size={13} strokeWidth={1.8} color="var(--success)" />
                      <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t._count?.bots ?? 0}</span>
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <UsersRound size={13} strokeWidth={1.8} color="var(--warning)" />
                      <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t._count?.customers ?? 0}</span>
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                      <Calendar size={13} strokeWidth={1.8} color="var(--text-tertiary)" />
                      {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tenants.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon"><Building2 size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">暂无商家</div>
            <div className="empty-desc">当前平台还没有入驻的商家记录</div>
          </div>
        )}

        {loading && (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>加载中...</div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
          <Building2 size={13} strokeWidth={1.8} />
          共 <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{total}</span> 个商家
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="btn-ghost"
            style={{ padding: "7px 13px", fontSize: 12.5 }}
            disabled={page <= 1}
            onClick={() => { const p = page - 1; setPage(p); fetchTenants(p); }}
          >
            <ChevronLeft size={14} strokeWidth={1.8} />
            上一页
          </button>
          <button
            className="btn-ghost"
            style={{ padding: "7px 13px", fontSize: 12.5 }}
            disabled={page * 20 >= total}
            onClick={() => { const p = page + 1; setPage(p); fetchTenants(p); }}
          >
            下一页
            <ChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
