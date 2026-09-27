'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ChatMsg {
  role: 'user' | 'agent';
  text: string;
  type?: 'A' | 'B' | 'C';
  suggestedOperation?: { id: string; params?: Record<string, any> };
  needsConfirm?: boolean;
  executed?: boolean;
  blocked?: boolean;
}

export default function AdminAgentFab() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'agent', text: '你好，我是管理员助手。可以问我系统状态、知识库/会话情况，或请求执行低风险运维操作（需你二次确认）。' },
  ]);
  const [pendingOp, setPendingOp] = useState<{ id: string; params?: Record<string, any> } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (confirm?: boolean) => {
    const text = input.trim();
    if (!text && !confirm) return;
    const userText = text || (pendingOp ? `确认执行 ${pendingOp.id}` : '');
    if (!userText) return;

    setMessages((m) => [...m, { role: 'user', text: userText }]);
    setInput('');
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/admin/agent/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: userText,
          operation: confirm && pendingOp ? pendingOp : undefined,
          confirm: !!confirm,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '请求失败');
      }
      const data = await res.json();
      const agentMsg: ChatMsg = {
        role: 'agent',
        type: data.type,
        text: data.answer || '',
        suggestedOperation: data.suggestedOperation,
        needsConfirm: data.needsConfirm,
        executed: data.executed,
        blocked: data.blocked,
      };
      setMessages((m) => [...m, agentMsg]);
      setPendingOp(data.suggestedOperation && data.needsConfirm ? data.suggestedOperation : null);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e.message || '请求失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const confirmOp = () => {
    setPendingOp(null);
    send(true);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="管理员助手"
          style={{
            position: 'fixed', right: 24, bottom: 24, zIndex: 60,
            width: 52, height: 52, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent)', color: '#fff', border: 'none',
            boxShadow: '0 8px 24px rgba(59,130,246,0.35)', cursor: 'pointer',
          }}
        >
          <Bot style={{ width: 24, height: 24 }} />
        </button>
      )}

      {open && (
        <div style={{
          position: 'fixed', right: 24, bottom: 24, zIndex: 60,
          width: 'min(380px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 48px))',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
            borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)',
          }}>
            <Bot style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>管理员助手</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{
                  maxWidth: '82%', padding: '10px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: m.role === 'agent' ? '1px solid var(--border-default)' : 'none',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.type === 'A' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--info)', fontSize: 11, fontWeight: 600 }}><CheckCircle2 style={{ width: 12, height: 12 }} />信息</span>}
                  {m.type === 'B' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warning)', fontSize: 11, fontWeight: 600 }}><Lightbulb style={{ width: 12, height: 12 }} />建议</span>}
                  {m.type === 'C' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: m.executed ? 'var(--success)' : 'var(--danger)', fontSize: 11, fontWeight: 600 }}><AlertTriangle style={{ width: 12, height: 12 }} />执行</span>}
                  <div style={{ marginTop: 4 }}>{m.text}</div>
                  {m.blocked && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--warning)' }}>需二次确认后才会执行</div>}
                </div>
              </div>
            ))}

            {pendingOp && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-primary" onClick={confirmOp} style={{ fontSize: 12.5 }}>
                  确认执行 {pendingOp.id}
                </button>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', animation: 'pulse 1s infinite' }} />
                思考中…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border-default)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="询问系统状态 / 排查问题…"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 13,
                border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
              }}
            />
            <button className="btn-primary" onClick={() => send()} disabled={loading} style={{ padding: '0 14px' }}>
              <Send style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
        </div>
      )}
    </>
  );
}
