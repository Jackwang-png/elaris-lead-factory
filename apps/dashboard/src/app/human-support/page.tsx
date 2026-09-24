"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Headset, Send, User, Bot, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { getChannelIcon, getChannelName } from "@/lib/channel-utils";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface PendingItem {
  id: string;
  channel: string;
  visitor: string;
  handoffReason: string;
  handoffAt: string;
  updatedAt: string;
  bot?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  messages?: { content: string; createdAt: string; sender: string; role: string }[];
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
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<PendingItem | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${API}/handoff/pending`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPending(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("加载待处理列表失败", e);
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
          sender:
            m.role === "agent" ? "agent" : m.role === "bot" ? "bot" : "user",
          createdAt: m.createdAt,
        })),
      );
    } catch (e) {
      console.error("加载会话消息失败", e);
    }
  }, []);

  // 初次加载
  useEffect(() => { fetchPending(); }, [fetchPending]);

  // URL 带 conversation 参数 → 自动打开对应会话
  useEffect(() => {
    const convId = searchParams.get("conversation");
    if (convId && pending.length > 0) {
      const item = pending.find((p) => p.id === convId);
      if (item) {
        setSelected(item);
        fetchMessages(item.id);
      }
    }
  }, [searchParams, pending, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openConversation(item: PendingItem) {
    setSelected(item);
    fetchMessages(item.id);
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
        {
          id: msg.id,
          content: msg.content,
          sender: "agent",
          createdAt: msg.createdAt,
        },
      ]);
      setInput("");
      setSelected((prev) => (prev ? { ...prev, handoffReason: prev.handoffReason } : prev));
      await fetchPending(); // 刷新列表（该会话移出待处理）
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
      await fetchPending();
    } catch (e) {
      console.error("标记处理失败", e);
      alert("操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="page-eyebrow">Human Support</div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            人工客服
            {pending.length > 0 && (
              <span style={{
                background: "var(--danger)", color: "#fff", fontSize: 12, fontWeight: 700,
                padding: "2px 10px", borderRadius: 999,
              }}>
                {pending.length} 待处理
              </span>
            )}
          </h1>
          <p className="page-subtitle">AI 无法回答的会话已自动转接，请及时回复客户</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchPending} style={{ gap: 6 }}>
          <RefreshCw size={13} /> 刷新
        </Button>
      </div>

      <div data-support-grid style={{
        display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, minHeight: 560,
        background: "var(--bg-card)", border: "1px solid var(--border-default)",
        borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-md)",
      }}>
        {/* 左：待处理列表 */}
        <aside style={{ borderRight: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>待处理会话</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>按转人工时间倒序</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {loading && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: "spin 0.9s linear infinite", display: "inline-block", marginRight: 6 }} />
                加载中...
              </div>
            )}
            {!loading && pending.length === 0 && (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
                <Headset size={26} strokeWidth={1.6} style={{ opacity: 0.5, marginBottom: 10 }} />
                <div style={{ fontSize: 13 }}>暂无待处理会话</div>
                <div style={{ fontSize: 11.5, marginTop: 4, color: "var(--text-muted)" }}>
                  AI 无法回答时会话会自动出现在这里
                </div>
              </div>
            )}
            {pending.map((p) => {
              const active = selected?.id === p.id;
              const who = p.customer?.name || p.visitor || p.id;
              const last = p.messages?.[0];
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
                      <span style={{ fontSize: 13, fontWeight: active ? 650 : 550, color: active ? "var(--accent)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {who}
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>
                      {new Date(p.handoffAt || p.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {last?.content || "（无消息）"}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontSize: 10.5, padding: "2px 8px", borderRadius: 999,
                      background: "var(--danger-soft)", color: "var(--danger)",
                    }}>
                      {REASON_LABEL[p.handoffReason] || p.handoffReason || "转人工"}
                    </span>
                    {p.bot?.name && (
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                        {p.bot.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 右：会话详情 + 回复 */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--text-tertiary)" }}>
              <Headset size={34} strokeWidth={1.5} style={{ opacity: 0.45 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>选择一个待处理会话</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>查看客户问题并回复</div>
            </div>
          ) : (
            <>
              <header style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-card)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                    {(selected.customer?.name || selected.visitor || "U")[0]?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}>
                      {selected.customer?.name || selected.visitor || "匿名访客"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {getChannelName(selected.channel)} 渠道 · 会话 {selected.id.slice(0, 8)}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={markResolved} disabled={busy} style={{ gap: 6 }}>
                  <CheckCircle2 size={13} /> 标记已处理
                </Button>
              </header>

              <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, marginTop: 40 }}>
                    暂无消息记录
                  </div>
                )}
                {messages.map((m) => (
                  <Bubble key={m.id} msg={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              <footer style={{ padding: "14px 20px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 4px 0", borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendReply())}
                    placeholder="输入回复内容，Enter 发送（客户可在 widget 会话历史中看到）"
                    disabled={sending}
                    style={{ background: "transparent", border: 0, padding: "0 12px", height: 44, boxShadow: "none" } as any}
                  />
                  <Button onClick={sendReply} disabled={!input.trim() || sending} size="icon" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 } as any}>
                    {sending ? <Loader2 size={15} style={{ animation: "spin 0.9s linear infinite" }} /> : <Send size={16} strokeWidth={1.8} />}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media(max-width:900px){ [data-support-grid] { grid-template-columns: 1fr !important; } }
      `}</style>
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
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--success)",
        }}>
          <Headset size={14} strokeWidth={1.8} />
        </div>
        <div style={{ maxWidth: "72%", background: "var(--bg-surface)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "12px 12px 12px 4px", padding: "10px 14px", lineHeight: 1.65, fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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
