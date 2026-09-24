"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Search,
  ShieldCheck,
  Filter,
  Calendar,
  User,
  Activity,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Clock,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type AuditLogItem = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  tenantId: string;
  userId?: string;
  detail?: any;
  success: boolean;
  failureReason?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  user?: { name?: string; email?: string } | null;
};

type QueryParams = {
  page: number;
  limit: number;
  action?: string;
  resource?: string;
  userId?: string;
  search?: string;
  success?: boolean;
  from?: string;
  to?: string;
};

const ACTION_PRESETS = [
  { value: "", label: "全部操作" },
  { value: "USER_LOGIN", label: "用户登录" },
  { value: "USER_REGISTER", label: "用户注册" },
  { value: "ORDER_PAID", label: "支付成功" },
  { value: "ORDER_FAILED", label: "支付失败" },
  { value: "ORDER_REFUNDED", label: "退款" },
  { value: "SUBSCRIPTION_UPGRADE", label: "套餐升级" },
  { value: "LEAD_CREATED", label: "线索创建" },
  { value: "LEAD_DELETED", label: "线索删除" },
  { value: "CUSTOMER_DELETED", label: "客户删除" },
  { value: "WEBHOOK_RECEIVED", label: "Webhook" },
  { value: "AI_CALL", label: "AI 调用" },
  { value: "ADMIN_ACTION", label: "管理员操作" },
  { value: "SYSTEM_TEST", label: "系统测试" },
];

const RESOURCE_PRESETS = [
  { value: "", label: "全部资源" },
  { value: "User", label: "用户" },
  { value: "PaymentOrder", label: "支付订单" },
  { value: "Subscription", label: "订阅" },
  { value: "Lead", label: "线索" },
  { value: "Customer", label: "客户" },
  { value: "Knowledge", label: "知识库" },
  { value: "Bot", label: "机器人" },
  { value: "Plan", label: "套餐" },
];

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailLog, setDetailLog] = useState<AuditLogItem | null>(null);

  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [successFilter, setSuccessFilter] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  const fetchLogs = useCallback(
    (p: number) => {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params: QueryParams = { page: p, limit: pageSize };
      if (action) params.action = action;
      if (resource) params.resource = resource;
      if (userId) params.userId = userId;
      if (search) params.search = search;
      if (successFilter !== "") params.success = successFilter === "true";
      if (from) params.from = from;
      if (to) params.to = to;

      axios
        .get(`${API}/audit`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setLogs(res.data.items || []);
          setTotal(res.data.total || 0);
        })
        .catch((err) => {
          console.error(err);
          setLogs([]);
          setTotal(0);
        })
        .finally(() => setLoading(false));
    },
    [action, resource, userId, search, successFilter, from, to]
  );

  useEffect(() => {
    fetchLogs(1);
    setPage(1);
  }, [fetchLogs]);

  function resetFilters() {
    setAction("");
    setResource("");
    setUserId("");
    setSearch("");
    setSuccessFilter("");
    setFrom("");
    setTo("");
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function exportCSV() {
    const headers = ["时间", "操作", "资源", "资源ID", "用户", "IP", "结果", "详情"];
    const rows = logs.map((l) => [
      formatDateTime(l.createdAt),
      l.action,
      l.resource,
      l.resourceId || "",
      l.user?.email || l.user?.name || l.userId || "",
      l.ip || "",
      l.success ? "成功" : `失败: ${l.failureReason || ""}`,
      l.detail ? JSON.stringify(l.detail) : "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getActionBadge(actionVal: string) {
    const isSystem = actionVal.startsWith("SYSTEM_") || actionVal.startsWith("WEBHOOK_");
    const isAdmin = actionVal.startsWith("ADMIN_");
    const isDelete = actionVal.includes("DELETE");
    const isFail = actionVal.includes("FAILED");
    let color = "var(--info)";
    let bg = "var(--info-soft)";
    if (isDelete || isFail) {
      color = "var(--danger)";
      bg = "var(--danger-soft)";
    } else if (isAdmin) {
      color = "var(--warning)";
      bg = "var(--warning-soft)";
    } else if (isSystem) {
      color = "var(--accent)";
      bg = "var(--accent-soft)";
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: bg,
          border: `1px solid ${color}`,
          color,
          letterSpacing: 0.2,
        }}
      >
        {actionVal}
      </span>
    );
  }

  function getResourceBadge(resource: string) {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "3px 10px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
          letterSpacing: 0.2,
        }}
      >
        {resource}
      </span>
    );
  }

  const hasActiveFilters =
    action || resource || userId || search || successFilter !== "" || from || to;

  return (
    <div className="fade-in-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Audit Trail</div>
          <h1>审计日志</h1>
          <p className="page-subtitle">记录系统关键操作，支持溯源与合规审计</p>
        </div>
        <button className="btn-ghost" onClick={exportCSV} disabled={logs.length === 0}>
          <Download size={14} strokeWidth={1.8} />
          <span>导出 CSV</span>
        </button>
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterRow}>
          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <Activity size={13} strokeWidth={1.8} />
              操作类型
            </label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              style={styles.filterSelect}
            >
              {ACTION_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <Filter size={13} strokeWidth={1.8} />
              资源类型
            </label>
            <select
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                setPage(1);
              }}
              style={styles.filterSelect}
            >
              {RESOURCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <CheckCircle size={13} strokeWidth={1.8} />
              状态
            </label>
            <select
              value={successFilter}
              onChange={(e) => {
                setSuccessFilter(e.target.value);
                setPage(1);
              }}
              style={styles.filterSelect}
            >
              <option value="">全部</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <User size={13} strokeWidth={1.8} />
              用户 ID
            </label>
            <input
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              placeholder="输入用户 ID"
              style={{ ...styles.filterInput, minWidth: 140 }}
            />
          </div>

          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <Calendar size={13} strokeWidth={1.8} />
              开始日期
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              style={styles.filterInput}
            />
          </div>

          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>
              <Calendar size={13} strokeWidth={1.8} />
              结束日期
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              style={styles.filterInput}
            />
          </div>
        </div>

        <div style={{ ...styles.filterRow, marginTop: 10 }}>
          <div style={styles.searchInputWrap}>
            <Search size={15} strokeWidth={1.8} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              placeholder="搜索操作/资源/详情..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  fetchLogs(1);
                  setPage(1);
                }
              }}
              style={styles.searchInput}
            />
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              fetchLogs(1);
              setPage(1);
            }}
          >
            <Search size={14} strokeWidth={2} />
            <span>查询</span>
          </button>
          {hasActiveFilters && (
            <button className="btn-ghost" onClick={resetFilters}>
              重置
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>时间</th>
                <th style={{ minWidth: 140 }}>操作</th>
                <th style={{ minWidth: 100 }}>资源</th>
                <th style={{ minWidth: 100 }}>资源 ID</th>
                <th style={{ minWidth: 180 }}>用户</th>
                <th style={{ minWidth: 120 }}>IP</th>
                <th style={{ minWidth: 60 }}>结果</th>
                <th style={{ width: 60 }}>详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Clock size={12} strokeWidth={1.8} color="var(--text-tertiary)" />
                      {formatDateTime(l.createdAt)}
                    </span>
                  </td>
                  <td>{getActionBadge(l.action)}</td>
                  <td>{getResourceBadge(l.resource)}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                    {l.resourceId ? l.resourceId.slice(0, 12) + (l.resourceId.length > 12 ? "..." : "") : "—"}
                  </td>
                  <td>
                    {l.user?.email || l.user?.name ? (
                      <div>
                        <div style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13 }}>
                          {l.user.email || l.user.name}
                        </div>
                        {l.userId && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                            {l.userId.slice(0, 12)}...
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>系统</span>
                    )}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                    {l.ip || "—"}
                  </td>
                  <td>
                    {l.success ? (
                      <span style={{ color: "var(--success)" }}>
                        <CheckCircle size={15} strokeWidth={1.8} />
                      </span>
                    ) : (
                      <span style={{ color: "var(--danger)" }} title={l.failureReason || ""}>
                        <XCircle size={15} strokeWidth={1.8} />
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      style={styles.iconBtn}
                      onClick={() => setDetailLog(l)}
                      title="查看详情"
                    >
                      <Eye size={14} strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon"><ShieldCheck size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">暂无审计日志</div>
            <div className="empty-desc">当前没有匹配条件的审计记录</div>
          </div>
        )}

        {loading && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>加载中...</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={styles.pagination}>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          共 <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{total}</span> 条记录
          {totalPages > 0 && (
            <>
              {" "}· 第{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{page}</span> /{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{totalPages}</span> 页
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-ghost"
            style={{ padding: "7px 13px", opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              fetchLogs(p);
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="btn-ghost"
            style={{ padding: "7px 13px", opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              fetchLogs(p);
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Detail Modal */}
      {detailLog && (
        <div
          style={styles.modalOverlay}
          onClick={() => setDetailLog(null)}
        >
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>审计日志详情</h2>
              <button style={styles.modalClose} onClick={() => setDetailLog(null)}>
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>操作 ID</span>
                <span style={{ ...styles.detailValue, fontFamily: "monospace", fontSize: 12 }}>
                  {detailLog.id}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>操作类型</span>
                <span style={styles.detailValue}>{getActionBadge(detailLog.action)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>资源</span>
                <span style={styles.detailValue}>
                  {getResourceBadge(detailLog.resource)}
                  {detailLog.resourceId && (
                    <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                      ({detailLog.resourceId})
                    </span>
                  )}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>操作人</span>
                <span style={styles.detailValue}>
                  {detailLog.user?.email || detailLog.user?.name || "系统操作"}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>时间</span>
                <span style={styles.detailValue}>{formatDateTime(detailLog.createdAt)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>IP 地址</span>
                <span style={styles.detailValue}>{detailLog.ip || "—"}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>User-Agent</span>
                <span style={{ ...styles.detailValue, fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>
                  {detailLog.userAgent || "—"}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>结果</span>
                <span style={styles.detailValue}>
                  {detailLog.success ? (
                    <span style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <CheckCircle size={14} /> 成功
                    </span>
                  ) : (
                    <span style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <XCircle size={14} /> 失败
                      {detailLog.failureReason && (
                        <span style={{ marginLeft: 6, color: "var(--text-muted)", fontSize: 12 }}>
                          ({detailLog.failureReason})
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </div>

              {detailLog.detail && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...styles.detailLabel, marginBottom: 8 }}>详细信息</div>
                  <pre style={styles.jsonBlock}>{JSON.stringify(detailLog.detail, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .audit-table tbody tr:hover {
          background: rgba(255,255,255,0.025) !important;
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-default)",
    borderRadius: 12,
    padding: "16px",
    marginBottom: 18,
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "flex-end",
  },
  filterItem: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  filterLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  filterSelect: {
    padding: "8px 12px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
    minWidth: 130,
    fontFamily: "inherit",
  },
  filterInput: {
    padding: "8px 12px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    width: 150,
    fontFamily: "inherit",
  },
  searchInputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 10,
    flex: "1 1 280px",
    maxWidth: 420,
  },
  searchInput: {
    background: "transparent !important",
    border: "none !important",
    outline: "none !important",
    padding: "9px 0",
    fontSize: 13.5,
    color: "var(--text-primary)",
    flex: 1,
    boxShadow: "none !important",
    minWidth: 0,
    fontFamily: "inherit",
  },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "transparent",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modalContent: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 560,
    maxHeight: "85vh",
    overflow: "hidden",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 24px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary)",
    letterSpacing: -0.2,
  },
  modalClose: {
    background: "transparent",
    border: "none",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
  },
  modalBody: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle)",
    gap: 16,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    flexShrink: 0,
    minWidth: 80,
  },
  detailValue: {
    fontSize: 13,
    color: "var(--text-primary)",
    textAlign: "right",
    flex: 1,
  },
  jsonBlock: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: 14,
    fontSize: 12,
    fontFamily: "monospace",
    color: "var(--text-secondary)",
    overflowX: "auto",
    maxHeight: 300,
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
};
