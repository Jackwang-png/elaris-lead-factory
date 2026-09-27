"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Headset, Send, User, Bot, CheckCircle2, Loader2, RefreshCw,
  Sparkles, Phone, Mail, ArrowLeft,
} from "lucide-react";
import { getChannelIcon, getChannelName } from "@/lib/channel-utils";
import { io, type Socket } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface ConvItem {
  id: string;
  channel: string;
  visitor: string;
  handoffReason: string;
  handoffAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  claimedByUserId: string | null;
  unreadCount?: number;
  bot?: { id: string; name: string } | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  messages?: { content: string; createdAt: string; sender: string; role: string }[];
  _count?: { messages: number };
}

interface ChatMsg {
  id: string;
  content: string;
  sender: "user" | "bot" | "agent";
  createdAt: string;
}

const REASON_LABEL: Record<string, string> = {
  unknown_intent: "无法理解",
  low_confidence: "低置信度",
  fallback_response: "兜底话术",
  manual: "手动转接",
};

const STATUS_TABS: { key: "pending" | "active" | "resolved"; label: string }[] = [
  { key: "pending", label: "待处理" },
  { key: "active", label: "处理中" },
  { key: "resolved", label: "已处理" },
];

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}

export default function HumanSupportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>加载中...</div>}>
      <HumanSupportInner />
    </Suspense>
  );
}

function HumanSupportInner() {
  const searchParams = useSearchParams();
  const [statusTab, setStatusTab] = useState<"pending" | "active" | "resolved">("pending");
  const [list, setList] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConvItem | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relatedKB, setRelatedKB] = useState<any[]>([]);
  const [narrow, setNarrow] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const fetchList = useCallback(async (status: "pending" | "active" | "resolved") => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/handoff/conversations?status=${status}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("加载会话列表失败", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`${API}/conversations/${conversationId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: any) => ({
          id: m.id,
          content: m.content,
          sender: m.role === "agent" ? "agent" : m.role === "bot" ? "bot" : "user",
          createdAt: m.createdAt,
        })),
      );
    } catch (e) {
      console.error("加载会话消息失败", e);
    }
  }, []);

  useEffect(() => { fetchList(statusTab); }, [statusTab, fetchList]);

  useEffect(() => {
    const convId = searchParams.get("conversation");
    if (convId && list.length > 0) {
      const item = list.find((p) => p.id === convId);
      if (item) openConversation(item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, list]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 实时未读更新：加入当前会话房间，监听新消息事件后刷新消息与列表（服务端权威计数）。
  useEffect(() => {
    if (!selected) return;
    const token = localStorage.getItem("token");
    const socket = io(`${API}/chat`, { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("joinConversation", selected.id));
    socket.on("message", () => {
      fetchMessages(selected.id);
      fetchList(statusTab);
    });
    return () => {
      socket.emit("leaveConversation", selected.id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [selected?.id, statusTab, fetchMessages, fetchList]);

  async function fetchRelated(item: ConvItem) {
    const lastUser = item.messages?.[0]?.sender === "user" ? item.messages[0].content : "";
    if (!lastUser) { setRelatedKB([]); return; }
    try {
      const res = await fetch(
        `${API}/knowledge/search?q=${encodeURIComponent(lastUser.slice(0, 80))}`,
        { headers: authHeaders() },
      );
      if (res.ok) {
        const d = await res.json();
        setRelatedKB(Array.isArray(d) ? d.slice(0, 4) : []);
      }
    } catch (e) {
      console.error("加载相关知识库失败", e);
    }
  }

  function openConversation(item: ConvItem) {
    setSelected(item);
    fetchMessages(item.id);
    fetchRelated(item);
  }

  async function claim(item: ConvItem) {
    try {
      const res = await fetch(`${API}/handoff/${item.id}/claim`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusTab("active");
    } catch (e) {
      console.error("认领失败", e);
      alert("认领失败，请重试");
    }
  }

  async function sendReply() {
    const text = input.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/handoff/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const msg = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: msg.id, content: msg.content, sender: "agent", createdAt: msg.createdAt },
      ]);
      setInput("");
      await fetchList(statusTab);
    } catch (e) {
      console.error("回复失败", e);
      alert("回复失败，请重试");
    } finally {
      setSending(false);
    }
  }

  async function markResolved() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/handoff/${selected.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(null);
      setMessages([]);
      setRelatedKB([]);
      await fetchList(statusTab);
    } catch (e) {
      console.error("标记处理失败", e);
      alert("操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  function insertSuggestion(text: string) {
    setInput((prev) => (prev ? prev + "\n" + text : text));
  }

  const isResolved = !!selected?.resolvedAt;
  const showBack = narrow && selected;

  return (
    <div className="fade-in-up">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="page-eyebrow">Human Support</div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            人工客服工作台
          </h1>
          <p className="page-subtitle">AI 无法回答的会话自动转接，左侧分状态处理，右侧查看客户与知识库</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchList(statusTab)} style={{ gap: 6 }}>
          <RefreshCw size={13} /> 刷新
        </Button>
      </div>

      <div data-support-grid style={{
        display: "grid", gridTemplateColumns: "320px 1fr 300px", gap: 0, minHeight: 580,
        background: "var(--bg-card)", border: "1px solid var(--border-default)",
        borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-md)",
      }}>
        {/* 左：会话列表（按状态分栏） */}
        <aside data-support-left style={{
          borderRight: "1px solid var(--border-default)", background: "var(--bg-elevated)",
          display: showBack ? "none" : "flex", flexDirection: "column", minWidth: 0,
        }}>
          <div style={{ padding: "12px 14px 0", display: "flex", gap: 6 }}>
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusTab(t.key)}
                style={{
                  flex: 1, padding: "8px 6px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  borderRadius: "9px 9px 0 0", border: "none",
                  background: statusTab === t.key ? "var(--bg-card)" : "transparent",
                  color: statusTab === t.key ? "var(--accent)" : "var(--text-tertiary)",
                  borderBottom: statusTab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {t.label}
                {t.key === "pending" && list.length > 0 && (
                  <span style={{
                    marginLeft: 6, background: "var(--danger)", color: "#fff", fontSize: 10.5,
                    fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                  }}>{list.length}</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {loading && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: "spin 0.9s linear infinite", display: "inline-block", marginRight: 6 }} />
                加载中...
              </div>
            )}
            {!loading && list.length === 0 && (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
                <Headset size={26} strokeWidth={1.6} style={{ opacity: 0.5, marginBottom: 10 }} />
                <div style={{ fontSize: 13 }}>暂无{STATUS_TABS.find((t) => t.key === statusTab)?.label}会话</div>
              </div>
            )}
            {list.map((p) => {
              const active = selected?.id === p.id;
              const who = p.customer?.name || p.visitor || p.id;
              const last = p.messages?.[0];
              const unread = (p.unreadCount || 0) > 0;
              return (
                <div
                  key={p.id}
                  onClick={() => openConversation(p)}
                  style={{
                    padding: "11px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 4,
                    background: active ? "var(--accent-soft)" : "transparent",
                    border: active ? "1px solid rgba(59,130,246,0.28)" : "1px solid transparent",
                    transition: "all 160ms ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <span style={{ color: "var(--text-tertiary)", display: "inline-flex", flexShrink: 0 }}>
                        {getChannelIcon(p.channel)}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: active ? 650 : 550,
                        color: active ? "var(--accent)" : "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{who}</span>
                      {unread && (
                        <span style={{
                          background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700,
                          minWidth: 16, height: 16, borderRadius: 999, display: "inline-flex",
                          alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0,
                        }}>{p.unreadCount}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>
                      {new Date(p.handoffAt || p.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {last?.content || "（无消息）"}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      fontSize: 10.5, padding: "2px 8px", borderRadius: 999,
                      background: "var(--danger-soft)", color: "var(--danger)",
                    }}>{REASON_LABEL[p.handoffReason] || p.handoffReason || "转人工"}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {statusTab === "pending" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); claim(p); }}
                          style={{
                            fontSize: 10.5, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
                            background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)",
                          }}
                        >认领</button>
                      )}
                      {p.bot?.name && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{p.bot.name}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 中：聊天 */}
        <section data-support-center style={{
          display: narrow && !selected ? "none" : "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)",
        }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--text-tertiary)" }}>
              <Headset size={34} strokeWidth={1.5} style={{ opacity: 0.45 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>选择一个会话</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>查看客户问题并回复</div>
            </div>
          ) : (
            <>
              <header style={{
                padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-card)", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {showBack && (
                    <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                    {(selected.customer?.name || selected.visitor || "U")[0]?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}>
                      {selected.customer?.name || selected.visitor || "匿名访客"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {getChannelName(selected.channel)} 渠道 · 会话 {selected.id.slice(0, 8)}
                      {isResolved && <span style={{ marginLeft: 8, color: "var(--success)" }}>· 已处理</span>}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={markResolved} disabled={busy || isResolved} style={{ gap: 6 }}>
                  <CheckCircle2 size={13} /> {isResolved ? "已处理" : "标记已处理"}
                </Button>
              </header>

              <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, marginTop: 40 }}>
                    暂无消息记录
                  </div>
                )}
                {messages.map((m) => (<Bubble key={m.id} msg={m} />))}
                <div ref={messagesEndRef} />
              </div>

              <footer style={{ padding: "14px 20px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                {isResolved ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", textAlign: "center" }}>该会话已处理，如需继续请重新发起转人工</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 4px 0", borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendReply())}
                      placeholder="输入回复内容，Enter 发送"
                      disabled={sending}
                      style={{ background: "transparent", border: 0, padding: "0 12px", height: 44, boxShadow: "none" } as any}
                    />
                    <Button onClick={sendReply} disabled={!input.trim() || sending} size="icon" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 } as any}>
                      {sending ? <Loader2 size={15} style={{ animation: "spin 0.9s linear infinite" }} /> : <Send size={16} strokeWidth={1.8} />}
                    </Button>
                  </div>
                )}
              </footer>
            </>
          )}
        </section>

        {/* 右：客户信息 + AI 辅助 */}
        <aside data-support-right style={{
          borderLeft: "1px solid var(--border-default)", background: "var(--bg-elevated)",
          display: showBack ? "none" : "flex", flexDirection: "column", minWidth: 0,
        }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12.5, padding: 20, textAlign: "center" }}>
              选择会话后展示客户信息与相关知识库
            </div>
          ) : (
            <>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>客户信息</div>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <InfoRow icon={<User size={13} />} label="姓名" value={selected.customer?.name || selected.visitor || "匿名访客"} />
                {selected.customer?.phone && <InfoRow icon={<Phone size={13} />} label="电话" value={selected.customer.phone} />}
                {selected.customer?.email && <InfoRow icon={<Mail size={13} />} label="邮箱" value={selected.customer.email} />}
                <InfoRow icon={getChannelIcon(selected.channel)} label="渠道" value={getChannelName(selected.channel)} />
                <InfoRow icon={<Headset size={13} />} label="消息数" value={String(selected._count?.messages ?? 0)} />
              </div>

              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>相关知识库</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {relatedKB.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>暂无相关条目</div>
                )}
                {relatedKB.map((kb, i) => (
                  <div key={kb.id || i} style={{ padding: "9px 11px", borderRadius: 10, background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{kb.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3, maxHeight: 48, overflow: "hidden" }}>
                      {kb.content?.slice(0, 90) || ""}
                    </div>
                    <button
                      onClick={() => insertSuggestion(kb.content?.slice(0, 200) || "")}
                      style={{ marginTop: 6, fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >引用为回复</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media(max-width:1100px){
          [data-support-grid]{ grid-template-columns: 320px 1fr !important; }
          [data-support-right]{ display:none !important; }
        }
        @media(max-width:768px){
          [data-support-grid]{ grid-template-columns: 1fr !important; min-height: 70vh; }
          [data-support-left]{ border-right:none !important; }
        }
      `}</style>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
      <span style={{ color: "var(--text-tertiary)", display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "var(--text-tertiary)", minWidth: 36 }}>{label}</span>
      <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  if (msg.sender === "agent") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 999, flexShrink: 0, marginTop: 2,
          background: "var(--success-soft)", border: "1px solid var(--border-default)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)",
        }}>
          <Headset size={14} strokeWidth={1.8} />
        </div>
        <div style={{
          maxWidth: "72%", background: "var(--bg-surface)", border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: "12px 12px 12px 4px", padding: "10px 14px", lineHeight: 1.65, fontSize: 13.5,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          <div style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600, marginBottom: 4 }}>人工客服</div>
          <div style={{ color: "var(--text-primary)" }}>{msg.content}</div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  const isUser = msg.sender === "user";
  const Icon = isUser ? User : Bot;
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", gap: 10 }}>
      {!isUser && (
        <div style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", marginTop: 2 }}>
          <Icon size={14} strokeWidth={1.8} />
        </div>
      )}
      <div style={{
        maxWidth: "72%", padding: "10px 14px", lineHeight: 1.65, fontSize: 13.5,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        ...(isUser
          ? { background: "var(--accent)", color: "#fff", borderRadius: "12px 12px 4px 12px" }
          : { background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "12px 12px 12px 4px" }),
      }}>
        <div>{msg.content}</div>
        <div style={{ marginTop: 6, fontSize: 10.5, opacity: isUser ? 0.82 : 1, color: isUser ? "rgba(255,255,255,0.82)" : "var(--text-muted)", textAlign: "right" }}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
