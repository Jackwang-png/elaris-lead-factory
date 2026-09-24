"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Loader2, RefreshCw, UserPlus, UserCog } from "lucide-react";

/**
 * 员工中心（GROWTH-STAFF-08B）
 *
 * 真实接口：
 *  - GET  /staff              员工列表（仅 OWNER 可访问）
 *  - POST /staff              添加员工 { name, email, password }
 *  - POST /staff/:id/disable  启用/禁用 { active: boolean }
 *
 * 所有操作成功后重新拉取真实接口，不在前端假装成功。
 */

interface StaffItem {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  active?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  merchant: "店主",
  OWNER: "店主",
  CUSTOMER_SERVICE: "客服",
  admin: "管理员",
};

function formatTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function StaffPage() {
  const [list, setList] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await api.get<StaffItem[] | { items: StaffItem[] }>("/staff");
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setList(data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403 || status === 401) {
        setForbidden(true);
      } else {
        setError("暂时无法加载员工列表");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 2500);
  }

  async function createStaff() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setError("请填写姓名、邮箱，密码至少 6 位");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/staff", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setForm({ name: "", email: "", password: "" });
      setShowForm(false);
      flash("操作成功");
      await load(); // 成功后刷新真实数据
    } catch (e: any) {
      setError(e?.response?.data?.message || "添加失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(staff: StaffItem, next: boolean) {
    setBusyId(staff.id);
    setError("");
    try {
      await api.post(`/staff/${staff.id}/disable`, { active: next });
      flash(next ? "已启用" : "已禁用");
      await load(); // 成功后刷新真实数据
    } catch (e: any) {
      setError(e?.response?.data?.message || "操作失败，请稍后重试");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        </div>
        <div className="empty-title">加载中…</div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <UserCog size={20} />
        </div>
        <div className="empty-title">暂无权限</div>
        <div className="empty-desc">员工管理仅店主可见</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-title">暂时无法加载</div>
        <div className="empty-desc">{error}</div>
        <Button className="btn-ghost" style={{ marginTop: 16 }} onClick={load}>
          <RefreshCw size={15} /> 重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <h1>员工中心</h1>
          <div className="page-subtitle">管理店铺成员与人工客服账号</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button className="btn-ghost" onClick={load}>
            <RefreshCw size={15} /> 刷新
          </Button>
          <Button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={15} /> 添加员工
          </Button>
        </div>
      </div>

      {success && (
        <div style={{ marginBottom: 14 }}>
          <span className="badge badge-success">{success}</span>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                姓名
              </div>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入姓名"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                邮箱
              </div>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="请输入邮箱"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                密码（至少 6 位）
              </div>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="请设置初始密码"
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button className="btn-primary" onClick={createStaff} disabled={submitting}>
                {submitting ? "提交中…" : "提交"}
              </Button>
              <Button className="btn-ghost" onClick={() => setShowForm(false)}>
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <UserCog size={20} />
          </div>
          <div className="empty-title">暂无员工</div>
          <div className="empty-desc">添加员工后可在人工客服中协作处理会话</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>最后登录</th>
                <th style={{ textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const active = s.isActive ?? s.active ?? false;
                return (
                  <tr key={s.id}>
                    <td>{s.name || "—"}</td>
                    <td>{s.email || "—"}</td>
                    <td>{ROLE_LABEL[s.role || ""] || s.role || "—"}</td>
                    <td>
                      <span className={`badge ${active ? "badge-success" : "badge-neutral"}`}>
                        {active ? "启用" : "已禁用"}
                      </span>
                    </td>
                    <td>{formatTime(s.createdAt)}</td>
                    <td>{formatTime(s.lastLogin)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        className="btn-ghost"
                        disabled={busyId === s.id}
                        onClick={() => toggleActive(s, !active)}
                      >
                        {busyId === s.id ? "处理中…" : active ? "禁用" : "启用"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
