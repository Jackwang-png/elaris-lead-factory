"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, Search } from "lucide-react";
import { getChannelIcon, getChannelName } from "@/lib/channel-utils";
import type { Bot as BotType, Customer, Conversation, Message } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function ChatPage() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [botId, setBotId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>("");
  const [channel, setChannel] = useState<string>("webchat");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ---------- 数据请求 ---------- */
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const botsRes = await fetch(`${API}/bots`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const botsData = await botsRes.json();
        setBots(botsData);
        if (botsData.length > 0) setBotId(botsData[0].id);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => { if (botId) fetchCustomers(); }, [botId]);
  useEffect(() => { if (selectedCustomer) fetchConversations(); }, [selectedCustomer]);
  useEffect(() => { if (selectedConversation) fetchMessages(); }, [selectedConversation]);
  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API}/customers?botId=${botId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setCustomers(data.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API}/conversations?customerId=${selectedCustomer}&botId=${botId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setConversations(data.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API}/conversations/${selectedConversation}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.channel) setChannel(data.channel);
      setMessages((data.messages || []).map((m: any) => ({
        id: m.id,
        content: m.content,
        sender: m.sender === 'customer' ? 'user' : 'bot',
        createdAt: m.createdAt,
      })));
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedCustomer || !selectedConversation || sending) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    const raw = inputMessage;
    setInputMessage('');
    setSending(true);
    try {
      const resp = await fetch(`${API}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ message: raw, customerId: selectedCustomer, conversationId: selectedConversation, channel }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'b',
        content: data.response,
        sender: 'bot',
        createdAt: new Date().toISOString(),
      }]);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  if (loading) return <CenterLoading />;

  return (
    <div style={layout}>
      {/* 左侧栏：助手列表 */}
      <aside style={sideCol}>
        <PanelHeader icon={<Bot size={15} strokeWidth={1.8} />} title="助手" />
        <div style={panelScroll} className="no-scrollbar">
          {bots.length === 0 && <PanelEmpty text="暂无助手" />}
          {bots.map((bot) => {
            const active = botId === bot.id;
            return (
              <div
                key={bot.id}
                onClick={() => { setBotId(bot.id); setSelectedCustomer(""); setSelectedConversation(""); setMessages([]); }}
                style={{
                  ...listItem,
                  background: active ? "var(--accent-soft)" : "transparent",
                  borderColor: active ? "rgba(59,130,246,0.28)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: active ? "var(--accent)" : "var(--bg-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: active ? "#fff" : "var(--text-secondary)",
                  flexShrink: 0,
                }}>
                  <Bot size={14} strokeWidth={1.8} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: active ? 650 : 550,
                    color: active ? "var(--accent)" : "var(--text-primary)",
                    letterSpacing: -0.05,
                  }}>{bot.name}</div>
                  <div style={listSub}>{bot.description || "客服助手"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 中间：客户 */}
      <aside style={sideCol}>
        <PanelHeader icon={<User size={15} strokeWidth={1.8} />} title="客户" />
        <div style={{ padding: "0 10px 8px" }}>
          <div style={miniSearch}>
            <Search size={13} color="var(--text-muted)" />
            <input style={miniSearchInput} placeholder="搜索客户..." />
          </div>
        </div>
        <div style={panelScroll} className="no-scrollbar">
          {customers.length === 0 && <PanelEmpty text="暂无客户" />}
          {customers.map((c) => {
            const active = selectedCustomer === c.id;
            return (
              <div key={c.id} onClick={() => { setSelectedCustomer(c.id); setSelectedConversation(""); setMessages([]); }}
                style={{
                  ...listItem, cursor: "pointer",
                  background: active ? "var(--accent-soft)" : "transparent",
                  borderColor: active ? "rgba(59,130,246,0.28)" : "transparent",
                }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 999,
                  background: active ? "var(--accent)" : "var(--bg-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: active ? "#fff" : "var(--text-secondary)",
                  fontSize: 11.5, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {(c.name || "U")[0]?.toUpperCase?.() || "U"}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 650 : 550, color: active ? "var(--accent)" : "var(--text-primary)" }}>
                    {c.name || "未命名客户"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 3 }}>
                    {c.identities?.slice(0, 1)?.map((id: any) => (
                      <div key={id.platform} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)", fontSize: 11 }}>
                        {getChannelIcon(id.platform)}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getChannelName(id.platform)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 会话列 */}
      <aside style={sideCol}>
        <PanelHeader icon={<Send size={15} strokeWidth={1.8} />} title="会话" />
        <div style={panelScroll} className="no-scrollbar">
          {conversations.length === 0 && <PanelEmpty text="暂无会话" hint="选择一位客户开始对话" />}
          {conversations.map((cv) => {
            const active = selectedConversation === cv.id;
            return (
              <div key={cv.id} onClick={() => setSelectedConversation(cv.id)}
                style={{
                  ...listItem, cursor: "pointer",
                  background: active ? "var(--accent-soft)" : "transparent",
                  borderColor: active ? "rgba(59,130,246,0.28)" : "transparent",
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ color: "var(--text-tertiary)", display: "inline-flex" }}>
                      {getChannelIcon(cv.channel)}
                    </span>
                    <span style={{
                      fontSize: 12.5, fontWeight: active ? 650 : 550,
                      color: active ? "var(--accent)" : "var(--text-primary)",
                    }}>{getChannelName(cv.channel)}</span>
                  </div>
                  <div style={{
                    fontSize: 12, color: "var(--text-tertiary)",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden", lineHeight: 1.45,
                  }}>
                    {cv.lastMessage?.content || "暂无消息"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>
                    {new Date(cv.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 聊天主区 */}
      <section style={chatArea}>
        {/* 顶部栏 */}
        <header style={chatHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "var(--accent-soft)",
              border: "1px solid rgba(59,130,246,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)",
            }}>
              {getChannelIcon(channel)}
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--text-primary)" }}>
                {getChannelName(channel)} 渠道
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                {selectedConversation ? "当前对话进行中" : "从左侧选择一个会话"}
              </div>
            </div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--success)", boxShadow: "0 0 0 3px var(--success-soft)" }} />
        </header>

        {/* 消息区 */}
        <div style={messagesArea} className="no-scrollbar">
          {messages.length === 0 ? (
            <ChatEmpty />
          ) : (
            messages.map((m) => <Bubble key={m.id} msg={m} />)
          )}
          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px 12px 12px 4px",
                padding: "10px 14px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={dot} />
                <span style={{ ...dot, animationDelay: "140ms" }} />
                <span style={{ ...dot, animationDelay: "280ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <footer style={inputArea}>
          <div style={inputWrap}>
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder={selectedConversation ? "输入消息，Enter 发送..." : "请先选择会话"}
              disabled={!selectedConversation || sending}
              style={{ background: "transparent", border: 0, padding: "0 12px", height: 44, boxShadow: "none" } as any}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || !selectedConversation || sending}
              size="icon"
              style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 } as any}
            >
              <Send size={16} strokeWidth={1.8} />
            </Button>
          </div>
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
            回复仅供参考 · 请核实重要信息
          </div>
        </footer>
      </section>

      <style>{`
        @keyframes b { 0%,80%,100% { transform: scale(0.7); opacity: 0.4 } 40% { transform: scale(1); opacity: 1 } }
        input:-webkit-autofill { -webkit-text-fill-color: var(--text-primary) !important; caret-color: var(--text-primary); -webkit-box-shadow: 0 0 0 1000px var(--bg-surface) inset !important; transition: background-color 9999s ease-in-out 0s; }
      `}</style>
    </div>
  );
}

/* ---------- 子组件 ---------- */
function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "16px 14px 12px",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <span style={{ color: "var(--accent)", display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)", letterSpacing: -0.05 }}>{title}</span>
    </div>
  );
}

function PanelEmpty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ padding: "26px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", fontWeight: 500 }}>{text}</div>
      {hint && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ChatEmpty() {
  return (
    <div style={{
      height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 12,
      color: "var(--text-tertiary)",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18,
        background: "var(--accent-soft)",
        border: "1px solid var(--border-default)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--accent)",
      }}>
        <Bot size={24} strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>还没有消息</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", maxWidth: 260 }}>
        从左侧选择一位客户与会话，开始您的第一次对话
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.sender === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 16,
      gap: 10,
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 999, flexShrink: 0,
          background: "var(--bg-hover)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-secondary)",
          marginTop: 2,
        }}>
          <Bot size={14} strokeWidth={1.8} />
        </div>
      )}
      <div style={{
        maxWidth: "72%",
        padding: "10px 14px",
        lineHeight: 1.65,
        fontSize: 13.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...(isUser
          ? {
              background: "var(--accent)",
              color: "#fff",
              borderRadius: "12px 12px 4px 12px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.25), 0 4px 12px var(--accent-glow)",
            }
          : {
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px 12px 12px 4px",
            }),
      }}>
        <div>{msg.content}</div>
        <div style={{
          marginTop: 6, fontSize: 10.5,
          opacity: isUser ? 0.82 : 1,
          color: isUser ? "rgba(255,255,255,0.82)" : "var(--text-muted)",
          textAlign: "right",
        }}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 999, flexShrink: 0,
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 11, fontWeight: 700,
          marginTop: 2,
        }}>我</div>
      )}
    </div>
  );
}

function CenterLoading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "calc(100vh - 80px)", color: "var(--text-tertiary)",
      gap: 10,
    }}>
      <span style={dot} />
      <span style={{ ...dot, animationDelay: "140ms" }} />
      <span style={{ ...dot, animationDelay: "280ms" }} />
      <span style={{ fontSize: 13, marginLeft: 4 }}>正在加载...</span>
    </div>
  );
}

/* ---------- 样式常量 ---------- */
const dot: React.CSSProperties = {
  display: "inline-block",
  width: 6, height: 6, borderRadius: 999,
  background: "var(--text-tertiary)",
  animation: "b 1s infinite ease-in-out",
};

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "230px 260px 280px 1fr",
  height: "calc(100vh - 64px)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "var(--shadow-md)",
};

const sideCol: React.CSSProperties = {
  borderRight: "1px solid var(--border-default)",
  background: "var(--bg-elevated)",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const panelScroll: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 8px 12px",
};

const listItem: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 10px",
  borderRadius: 10,
  marginBottom: 4,
  border: "1px solid transparent",
  transition: "all 160ms ease",
};

const listSub: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-tertiary)",
  marginTop: 3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const miniSearch: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  height: 34,
  borderRadius: 9,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
};

const miniSearchInput: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: 0,
  outline: "none",
  color: "var(--text-primary)",
  fontSize: 12.5,
  padding: 0,
  minWidth: 0,
};

const chatArea: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  background: "var(--bg)",
};

const chatHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 22px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "var(--bg-card)",
};

const messagesArea: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "24px 26px",
  display: "flex",
  flexDirection: "column",
};

const inputArea: React.CSSProperties = {
  padding: "14px 22px 18px",
  borderTop: "1px solid var(--border-subtle)",
  background: "var(--bg-card)",
};

const inputWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "4px 4px 4px 0",
  borderRadius: 12,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  transition: "border-color 160ms ease, box-shadow 160ms ease",
};
