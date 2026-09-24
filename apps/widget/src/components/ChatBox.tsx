import { useState, useEffect, useRef } from "react";

// 内联 SVG 图标（widget 不依赖额外图标库）
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
  </svg>
);
const MessageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const HeadsetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h3" />
  </svg>
);
const LoaderSpin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

type Msg = {
  id?: string;
  role: "user" | "bot" | "agent";
  text: string;
};

/**
 * 客服 widget（客户侧）。
 * - 通过 REST 调 api 的 /widget/chat（AI 回复；AI 无法回答时自动转人工）
 * - 转人工后轮询 /widget/history 回读人工客服回复（会话历史可见）
 */
const API_BASE =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://api.wan-wan.xyz");

const BOT_ID = (import.meta.env.VITE_BOT_ID as string) || "cmsgydx070004en4h4hqh2m07";

function getVisitorId(): string {
  try {
    let vid = localStorage.getItem("smartcs_visitor_id");
    if (!vid) {
      vid = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("smartcs_visitor_id", vid);
    }
    return vid;
  } catch {
    return `w_${Date.now().toString(36)}`;
  }
}

export default function ChatBox() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef<string>(getVisitorId());
  const seenIds = useRef<Set<string>>(new Set());

  // 转人工后轮询会话历史（拿到人工客服回复）
  useEffect(() => {
    if (!needsHuman || !conversationIdRef.current) return;
    const timer = setInterval(async () => {
      const convId = conversationIdRef.current;
      if (!convId) return;
      try {
        const res = await fetch(
          `${API_BASE}/widget/history?conversationId=${encodeURIComponent(convId)}&visitorId=${encodeURIComponent(visitorIdRef.current)}`,
        );
        if (!res.ok) return;
        const list = await res.json();
        if (!Array.isArray(list)) return;
        const fresh = list.filter((m: any) => !seenIds.current.has(m.id));
        if (fresh.length === 0) return;
        for (const m of fresh) seenIds.current.add(m.id);
        setMessages((old) => [
          ...old,
          ...fresh.map((m: any) => ({
            id: m.id,
            role: m.sender === "agent" ? ("agent" as const) : m.sender === "bot" ? ("bot" as const) : ("user" as const),
            text: m.content,
          })),
        ]);
      } catch {
        /* 轮询失败忽略 */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [needsHuman]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setMessages((old) => [...old, { role: "user", text }]);
    setInput("");
    try {
      const res = await fetch(`${API_BASE}/widget/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: BOT_ID,
          visitorId: visitorIdRef.current,
          message: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      conversationIdRef.current = data.conversationId;
      const botMsg: Msg = { role: "bot", text: data.response };
      setMessages((old) => [...old, botMsg]);

      if (data.needsHuman) {
        setNeedsHuman(true);
        seenIds.current.clear();
      }
    } catch (e: any) {
      setMessages((old) => [...old, { role: "bot", text: "抱歉，服务暂时不可用，请稍后再试。" }]);
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={styles.wrap}>
      {/* 头部 */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.avatar}>
            <MessageIcon />
          </div>
          <div>
            <div style={styles.title}>在线客服</div>
            <div style={styles.status}>
              <span style={{ ...styles.dot, background: "#34d399" }} />
              {needsHuman ? "人工客服已接入，请稍候" : "在线 · 随时为您服务"}
            </div>
          </div>
        </div>
      </header>

      {/* 消息区 */}
      <div ref={scrollRef} style={styles.messages}>
        {messages.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>
              <MessageIcon />
            </div>
            <div style={styles.emptyTitle}>您好，有什么可以帮您？</div>
            <div style={styles.emptyHint}>发送消息，我们会尽快为您解答</div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === "user";
            const isAgent = m.role === "agent";
            return (
              <div
                key={m.id || i}
                style={{ ...styles.row, justifyContent: isUser ? "flex-end" : "flex-start" }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    ...(isUser
                      ? styles.bubbleUser
                      : isAgent
                        ? styles.bubbleAgent
                        : styles.bubbleBot),
                  }}
                >
                  {isAgent && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 650, color: "#10b981", marginBottom: 4 }}>
                      <HeadsetIcon />
                      人工客服
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div style={{ ...styles.row, justifyContent: "flex-start" }}>
            <div style={{ ...styles.bubble, ...styles.bubbleBot, display: "flex", alignItems: "center", gap: 6 }}>
              <LoaderSpin />
              正在思考...
            </div>
          </div>
        )}
      </div>

      {/* 转人工提示条 */}
      {needsHuman && (
        <div style={styles.handoffBar}>
          已为您转接人工客服，人工回复会显示在这里，请稍候～
        </div>
      )}

      {/* 输入区 */}
      <footer style={styles.footer}>
        <div style={styles.inputWrap}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="输入消息，Enter 发送..."
            disabled={sending}
          />
          <button style={styles.sendBtn} onClick={send} disabled={!input.trim() || sending}>
            <SendIcon />
          </button>
        </div>
      </footer>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: 360,
    maxWidth: "100%",
    height: 520,
    background: "#0b0d12",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    boxShadow: "0 16px 40px rgba(0,0,0,0.42), 0 4px 8px rgba(0,0,0,0.24)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    color: "rgba(255,255,255,0.92)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#0f1218",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 9,
    background: "#3b82f6",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  title: { fontSize: 14, fontWeight: 650, letterSpacing: -0.1, color: "rgba(255,255,255,0.92)" },
  status: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  dot: { display: "inline-block", width: 6, height: 6, borderRadius: 999 },
  messages: {
    flex: 1, overflowY: "auto", padding: "18px 16px",
    display: "flex", flexDirection: "column", gap: 12,
  },
  empty: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 10,
    color: "rgba(255,255,255,0.4)", textAlign: "center",
  },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 16,
    background: "rgba(59,130,246,0.12)", border: "1px solid rgba(255,255,255,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6",
  },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.62)" },
  emptyHint: { fontSize: 12, color: "rgba(255,255,255,0.32)" },
  row: { display: "flex" },
  bubble: {
    maxWidth: "78%", padding: "10px 13px", fontSize: 13,
    lineHeight: 1.6, wordBreak: "break-word", whiteSpace: "pre-wrap",
  },
  bubbleUser: {
    background: "#3b82f6", color: "#fff",
    borderRadius: "12px 12px 4px 12px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.25), 0 4px 12px rgba(59,130,246,0.18)",
  },
  bubbleBot: {
    background: "#141821", color: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px 12px 12px 4px",
  },
  bubbleAgent: {
    background: "rgba(16,185,129,0.10)", color: "rgba(255,255,255,0.95)",
    border: "1px solid rgba(16,185,129,0.35)", borderRadius: "12px 12px 12px 4px",
  },
  handoffBar: {
    padding: "8px 14px", fontSize: 11.5, color: "#fbbf24",
    background: "rgba(245,158,11,0.10)", borderTop: "1px solid rgba(245,158,11,0.2)",
    textAlign: "center",
  },
  footer: { padding: "12px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0f1218" },
  inputWrap: {
    display: "flex", alignItems: "center", gap: 8,
    background: "#141821", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 11, padding: "4px 4px 4px 12px",
    transition: "border-color 150ms ease",
  },
  input: {
    flex: 1, background: "transparent", border: 0, outline: "none",
    color: "rgba(255,255,255,0.92)", fontSize: 13, padding: "8px 0", minWidth: 0,
    fontFamily: "inherit",
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 9, background: "#3b82f6", border: 0,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "background 150ms ease",
  },
};
