"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Target, Search, RefreshCw, Sparkles, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Types (P0-5B.3 confirmed contracts — no invented fields)            */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  salesStatus?: string | null;
  company?: string | null;
  industry?: string | null;
  source?: string | null;
  intentScore?: number | null;
  intentLevel?: string | null;
  interests?: string[];
  tags?: string[];
  budget?: string | null;
  buyingStage?: string | null;
  urgency?: string | null;
  highPurchaseIntent?: boolean | null;
  content?: string | null;
  remark?: string | null;
  followCount?: number | null;
  lastContactAt?: string | null;
  conversationId?: string | null;
  createdAt?: string;
}

interface LeadIntelligence {
  id: string;
  leadId: string;
  runId: string;
  leadScore?: number | null;
  fitScore?: number | null;
  intentScore?: number | null;
  priority?: string | null;
  observed?: any;
  inferred?: any;
  unknowns?: any;
  painPoints?: any;
  recommendedAction?: string | null;
  suggestedStrategy?: any;
  reasoningSummary?: string | null;
  modelMetadata?: any;
  createdAt?: string;
}

interface LeadSignal {
  id: string;
  signalType: string;
  factOrInference: string;
  confidence?: string | null;
  evidenceText?: string | null;
  sourceRef?: string | null;
  observedAt?: string;
}

interface ConversationMessage {
  id: string;
  content: string;
  sender?: string;
  role?: string;
  createdAt?: string;
}

interface Conversation {
  id: string;
  channel?: string | null;
  bot?: { name?: string } | null;
  messages?: ConversationMessage[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PRIORITY_META: Record<string, { label: string; variant: string }> = {
  P0: { label: "P0 紧急", variant: "destructive" },
  P1: { label: "P1 高", variant: "warning" },
  P2: { label: "P2 中", variant: "info" },
  P3: { label: "P3 低", variant: "secondary" },
};

const ACTION_LABEL: Record<string, string> = {
  draft_message: "建议生成跟进草稿",
  follow_up_question: "建议追问澄清",
  wait: "建议暂缓等待",
  escalate: "建议升级人工",
};

const ACTION_VARIANT: Record<string, string> = {
  draft_message: "success",
  follow_up_question: "info",
  wait: "secondary",
  escalate: "warning",
};

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-tertiary)";
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

function scoreBg(score: number | null | undefined): string {
  if (score == null) return "transparent";
  if (score >= 80) return "var(--success-soft)";
  if (score >= 50) return "var(--warning-soft)";
  return "var(--danger-soft)";
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "new", label: "新线索" },
  { value: "contacted", label: "已联系" },
  { value: "qualified", label: "已合格" },
  { value: "lost", label: "已流失" },
];

const SCORE_OPTIONS = [
  { value: "all", label: "全部评分" },
  { value: "high", label: "高 (≥80)" },
  { value: "medium", label: "中 (50-79)" },
  { value: "low", label: "低 (<50)" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "全部 Priority" },
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
];

const PAGE_SIZE = 10;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [intel, setIntel] = useState<LeadIntelligence | null>(null);
  const [signals, setSignals] = useState<LeadSignal[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);

  // 已加载过的 intelligence 缓存（leadId → priority），用于列表 Priority 列与筛选
  const priorityCache = useRef<Record<string, string>>({});

  /* ---------------- list ---------------- */
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (scoreFilter !== "all") params.score = scoreFilter;
      const res = await api.get<{ items: Lead[]; total: number }>("/leads", { params });
      setLeads(res.data.items || []);
      setTotal(res.data.total || 0);
      // 若当前选中项不在当前页，清空选中
      if (selectedId && !(res.data.items || []).some((l) => l.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setIntel(null);
        setSignals([]);
        setConversation(null);
      }
    } catch (e: any) {
      setListError(e?.response?.data?.message || "加载客户列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, scoreFilter, selectedId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // 防抖搜索
  const searchTimer = useRef<any>(null);
  const onSearchChange = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setPage(1), 400);
  };

  /* ---------------- detail ---------------- */
  const loadDetail = useCallback(
    async (lead: Lead) => {
      setSelectedId(lead.id);
      setDetail(lead);
      setDetailError(null);
      setIntelError(null);
      setIntel(null);
      setSignals([]);
      setConversation(null);
      setDetailLoading(true);

      try {
        // 1) conversation (if present)
        if (lead.conversationId) {
          api
            .get<Conversation>(`/conversations/${lead.conversationId}`)
            .then((r) => setConversation(r.data))
            .catch(() => setConversation(null));
        }

        // 2) current intelligence (404 = no intelligence yet)
        setIntelLoading(true);
        try {
          const res = await api.get<LeadIntelligence>(`/api/v2/leads/${lead.id}/intelligence/current`);
          setIntel(res.data);
          if (res.data.priority) priorityCache.current[lead.id] = res.data.priority;
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setIntel(null); // no intelligence — show Analyze Lead
          } else if (err?.response?.status === 401 || err?.response?.status === 403) {
            setIntelError("未授权访问 AI 分析");
          } else {
            setIntelError("加载 AI 分析失败");
          }
        } finally {
          setIntelLoading(false);
        }

        // 3) signals (best-effort)
        api
          .get<LeadSignal[]>(`/api/v2/leads/${lead.id}/intelligence/signals`)
          .then((r) => setSignals(Array.isArray(r.data) ? r.data : []))
          .catch(() => setSignals([]));
      } catch (e: any) {
        setDetailError(e?.response?.data?.message || "加载客户详情失败");
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  /* ---------------- analyze ---------------- */
  const runAnalysis = useCallback(async () => {
    if (!detail) return;
    setAnalyzing(true);
    setIntelError(null);
    try {
      const res = await api.post<LeadIntelligence>(`/api/v2/leads/${detail.id}/intelligence/analysis`, {
        triggerType: "MANUAL",
      });
      setIntel(res.data);
      if (res.data.priority) priorityCache.current[detail.id] = res.data.priority;
      // refresh signals after analysis
      api
        .get<LeadSignal[]>(`/api/v2/leads/${detail.id}/intelligence/signals`)
        .then((r) => setSignals(Array.isArray(r.data) ? r.data : []))
        .catch(() => setSignals([]));
      // refresh list row (priority may now show)
      fetchLeads();
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        setIntelError("未授权访问 AI 分析");
      } else {
        setIntelError(e?.response?.data?.message || "AI 分析失败，请稍后重试");
      }
    } finally {
      setAnalyzing(false);
    }
  }, [detail, fetchLeads]);

  /* ---------------- derived ---------------- */
  const filteredLeads = useMemo(() => {
    if (priorityFilter === "all") return leads;
    return leads.filter((l) => priorityCache.current[l.id] === priorityFilter);
  }, [leads, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ---------------- render ---------------- */
  return (
    <div className="fade-in-up">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="page-eyebrow">Pipeline · AI Intelligence</div>
          <h1>潜在客户</h1>
          <p className="page-subtitle">AI 驱动的客户价值分析：点击客户查看 Intelligence / Signals / 推荐动作</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLeads()}>
          <RefreshCw size={14} style={{ marginRight: 6 }} /> 刷新
        </Button>
      </div>

      {/* 工具栏 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <Input
            placeholder="搜索姓名 / 邮箱 / 电话"
            defaultValue={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 40, borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13 }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={scoreFilter}
          onChange={(e) => { setScoreFilter(e.target.value); setPage(1); }}
          style={{ height: 40, borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13 }}
        >
          {SCORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{ height: 40, borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13 }}
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ alignSelf: "center", color: "var(--text-tertiary)", fontSize: 12, marginLeft: "auto" }}>
          共 {total} 个客户
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "minmax(0,1fr) minmax(360px,420px)" : "1fr", gap: 16, alignItems: "start" }}>
        {/* ============ 左侧：列表 ============ */}
        <div>
          {loading ? (
            <Card><CardContent style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
              <div className="empty-icon"><Target size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
              <div className="empty-title">加载中</div>
              <div className="empty-desc">正在获取潜在客户列表</div>
            </CardContent></Card>
          ) : listError ? (
            <Card><CardContent style={{ padding: 32, textAlign: "center" }}>
              <div className="empty-icon"><AlertCircle size={20} color="var(--danger)" /></div>
              <div className="empty-title">加载失败</div>
              <div className="empty-desc">{listError}</div>
              <Button variant="outline" size="sm" style={{ marginTop: 12 }} onClick={() => fetchLeads()}>重试</Button>
            </CardContent></Card>
          ) : filteredLeads.length === 0 ? (
            <Card><CardContent style={{ padding: 32, textAlign: "center" }}>
              <div className="empty-icon"><Target size={22} strokeWidth={1.7} color="var(--accent)" /></div>
              <div className="empty-title">
                {priorityFilter !== "all" && leads.length > 0 ? "该 Priority 暂无客户" : "还没有潜在客户"}
              </div>
              <div className="empty-desc">
                {priorityFilter !== "all" && leads.length > 0
                  ? "点击客户运行 AI 分析后，Priority 会出现在这里"
                  : "客户互动后会自动沉淀为潜在客户"}
              </div>
            </CardContent></Card>
          ) : (
            <Card style={{ padding: 0 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户</TableHead>
                    <TableHead>公司</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>最后互动</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((l) => {
                    const prio = priorityCache.current[l.id];
                    const prioMeta = PRIORITY_META[prio];
                    return (
                      <TableRow
                        key={l.id}
                        onClick={() => loadDetail(l)}
                        style={{ cursor: "pointer", background: selectedId === l.id ? "var(--accent-soft)" : undefined }}
                      >
                        <TableCell>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{l.name || "未知"}</div>
                          {l.email && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{l.email}</div>}
                        </TableCell>
                        <TableCell style={{ color: "var(--text-secondary)" }}>{l.company || "—"}</TableCell>
                        <TableCell style={{ color: "var(--text-secondary)" }}>{l.source || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{l.salesStatus || l.status || "new"}</Badge>
                        </TableCell>
                        <TableCell>
                          {prioMeta ? <Badge variant={prioMeta.variant}>{prioMeta.label}</Badge> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                        </TableCell>
                        <TableCell>
                          {l.intentScore != null ? (
                            <span style={{ fontWeight: 700, fontSize: 15, color: scoreColor(l.intentScore) }}>{l.intentScore}</span>
                          ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                        </TableCell>
                        <TableCell>
                          {intel && intel.leadId === l.id && intel.fitScore != null ? (
                            <span style={{ fontWeight: 700, fontSize: 15, color: scoreColor(intel.fitScore) }}>{intel.fitScore}</span>
                          ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                        </TableCell>
                        <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{fmtDate(l.lastContactAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {/* 分页 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>第 {page} / {totalPages} 页</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} /> 上一页
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    下一页 <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ============ 右侧：详情 ============ */}
        {selectedId && (
          <div>
            {detailLoading && !detail ? (
              <Card><CardContent style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
                <div className="empty-title">加载详情…</div>
              </CardContent></Card>
            ) : detailError ? (
              <Card><CardContent style={{ padding: 24, textAlign: "center" }}>
                <AlertCircle size={18} color="var(--danger)" />
                <div className="empty-title">加载失败</div>
                <div className="empty-desc">{detailError}</div>
              </CardContent></Card>
            ) : detail ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* 基本信息 */}
                <Card>
                  <CardContent style={{ padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{detail.name || "未知客户"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 12, fontSize: 13 }}>
                      <InfoRow label="邮箱" value={detail.email || "—"} />
                      <InfoRow label="电话" value={detail.phone || "—"} />
                      <InfoRow label="公司" value={detail.company || "—"} />
                      <InfoRow label="行业" value={detail.industry || "—"} />
                      <InfoRow label="来源" value={detail.source || "—"} />
                      <InfoRow label="状态" value={detail.salesStatus || detail.status || "—"} />
                      <InfoRow label="预算" value={detail.budget || "—"} />
                      <InfoRow label="购买阶段" value={detail.buyingStage || "—"} />
                      <InfoRow label="最后互动" value={fmtDate(detail.lastContactAt)} />
                      <InfoRow label="跟进次数" value={detail.followCount != null ? String(detail.followCount) : "—"} />
                    </div>
                    {(detail.interests && detail.interests.length > 0) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                        {detail.interests.slice(0, 6).map((t, i) => (
                          <Badge key={i} variant="info">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Intelligence */}
                <Card style={{ border: intel ? "1px solid var(--accent)" : undefined }}>
                  <CardContent style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                        <Sparkles size={15} color="var(--accent)" /> AI Intelligence
                      </div>
                      {intel && <Badge variant={PRIORITY_META[intel.priority!]?.variant || "secondary"}>{intel.priority || "—"}</Badge>}
                    </div>

                    {intelLoading ? (
                      <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>AI 分析加载中…</div>
                    ) : intelError ? (
                      <div style={{ padding: "16px 0", textAlign: "center" }}>
                        <div style={{ color: "var(--danger)", fontSize: 13 }}>{intelError}</div>
                        <Button variant="outline" size="sm" style={{ marginTop: 10 }} onClick={() => loadDetail(detail)}>重试</Button>
                      </div>
                    ) : !intel ? (
                      <div style={{ padding: "24px 0", textAlign: "center" }}>
                        <div style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 12 }}>
                          AI analysis not available yet
                        </div>
                        <Button size="sm" disabled={analyzing} onClick={runAnalysis}>
                          <Sparkles size={14} style={{ marginRight: 6 }} />
                          {analyzing ? "分析中…" : "Analyze Lead"}
                        </Button>
                      </div>
                    ) : (
                      <div>
                        {/* Scores */}
                        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                          <ScoreBox label="Fit Score" value={intel.fitScore} />
                          <ScoreBox label="Intent Score" value={intel.intentScore} />
                          <ScoreBox label="Lead Score" value={intel.leadScore} />
                        </div>

                        {/* Reasoning */}
                        {intel.reasoningSummary && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 4 }}>Reasoning Summary</div>
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                              {intel.reasoningSummary}
                            </div>
                          </div>
                        )}

                        {/* Recommended Action */}
                        {intel.recommendedAction && (
                          <div style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 4 }}>Recommended Action</div>
                            <Badge variant={ACTION_VARIANT[intel.recommendedAction] || "secondary"}>
                              {ACTION_LABEL[intel.recommendedAction] || intel.recommendedAction}
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Signals */}
                <Card>
                  <CardContent style={{ padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 10 }}>Signals</div>
                    {signals.length === 0 ? (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13, padding: "8px 0" }}>
                        {intel ? "暂无信号" : "运行 AI 分析后，这里会显示证据链信号"}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {signals.map((s) => (
                          <div key={s.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{s.signalType}</span>
                              <SignalBadge kind={s.factOrInference} />
                              {s.confidence && <Badge variant="outline">{s.confidence}</Badge>}
                            </div>
                            {s.evidenceText && (
                              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.55 }}>{s.evidenceText}</div>
                            )}
                            {s.sourceRef && (
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>来源：{s.sourceRef}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Conversation */}
                <Card>
                  <CardContent style={{ padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 10 }}>
                      Conversation {conversation?.channel ? `· ${conversation.channel}` : ""}
                    </div>
                    {!detail.conversationId ? (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>该客户暂无关联会话</div>
                    ) : !conversation ? (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>会话加载中…</div>
                    ) : !conversation.messages || conversation.messages.length === 0 ? (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>会话暂无消息</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                        {conversation.messages.map((m) => (
                          <div key={m.id} style={{ alignSelf: m.sender === "bot" || m.role === "bot" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                            <div style={{
                              fontSize: 12.5, lineHeight: 1.55, padding: "8px 12px", borderRadius: 12,
                              background: m.sender === "bot" || m.role === "bot" ? "var(--accent-soft)" : "var(--bg-surface)",
                              border: "1px solid var(--border-subtle)", color: "var(--text-primary)",
                            }}>
                              {m.content}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2, paddingLeft: 2 }}>
                              {m.sender === "bot" || m.role === "bot" ? "AI" : "客户"} · {fmtDate(m.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: "1px dashed var(--border-subtle)", padding: "3px 0" }}>
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function ScoreBox({ label, value }: { label: string; value?: number | null }) {
  return (
    <div style={{ flex: 1, textAlign: "center", background: scoreBg(value), border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "12px 8px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: scoreColor(value), letterSpacing: "-0.02em" }}>
        {value != null ? value : "—"}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SignalBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; variant: string }> = {
    OBSERVED: { label: "Observed", variant: "success" },
    INFERRED: { label: "Inferred", variant: "warning" },
    UNKNOWN: { label: "Unknown", variant: "outline" },
  };
  const meta = map[kind] || { label: kind, variant: "secondary" };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
