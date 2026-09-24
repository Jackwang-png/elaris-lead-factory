"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Search, Shield, Building2, UserPlus, Users } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  function fetchUsers(p = 1, q = "") {
    setLoading(true);
    const token = localStorage.getItem("token");
    axios
      .get(`${API}/admin/users`, {
        params: { page: p, limit: 20, search: q },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setUsers(res.data.items || []);
        setTotal(res.data.total || 0);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  async function setRole(userId: string, role: string) {
    const token = localStorage.getItem("token");
    try {
      await axios.post(
        `${API}/admin/users/${userId}/role`,
        { role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchUsers();
    } catch (e) {
      alert("设置失败，请检查权限");
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  function getRoleBadge(role: string) {
    const map: Record<string, { cls: string; label: string }> = {
      admin: { cls: "badge-danger", label: "管理员" },
      merchant: { cls: "badge-info", label: "商家" },
      user: { cls: "badge-neutral", label: "用户" },
    };
    const c = map[role] || map.user;
    return <span className={`badge ${c.cls}`}>{c.label}</span>;
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">User Management</div>
          <h1>用户管理</h1>
          <p className="page-subtitle">管理平台注册用户、分配角色与权限</p>
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
            placeholder="搜索邮箱 / 用户名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") fetchUsers(1, search); }}
            style={{ background: "transparent !important", border: "none !important", outline: "none !important", padding: "10px 0", fontSize: 13.5, flex: 1, boxShadow: "none !important", minWidth: 0 }}
          />
        </div>
        <button className="btn-primary" onClick={() => fetchUsers(1, search)}>
          <Search size={14} strokeWidth={2} />
          搜索
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                {["邮箱", "用户名", "角色", "所属商家", "操作"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.email}</td>
                  <td>{u.username || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td>{getRoleBadge(u.role)}</td>
                  <td>
                    {u.tenantId?.slice(0, 8)
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                          <Building2 size={13} strokeWidth={1.8} color="var(--text-tertiary)" />
                          {u.tenantId.slice(0, 8)}
                        </span>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td>
                    {u.role !== "admin" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn-ghost" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setRole(u.id, "merchant")}>
                          <Shield size={12} strokeWidth={1.8} />
                          设为商家
                        </button>
                        <button className="btn-ghost" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setRole(u.id, "user")}>
                          <UserPlus size={12} strokeWidth={1.8} />
                          设为用户
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon"><Users size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">暂无用户</div>
            <div className="empty-desc">当前没有匹配条件的用户记录</div>
          </div>
        )}

        {loading && (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>加载中...</div>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <Users size={13} strokeWidth={1.8} />
        共 <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{total}</span> 个用户
      </div>
    </div>
  );
}
