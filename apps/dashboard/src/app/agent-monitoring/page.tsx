'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Cpu, MemoryStick, XCircle, Activity } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface AgentStatus {
  id: string;
  name: string;
  status: string;
  conversations: number;
  lastActive: string;
  memoryUsage: number;
  cpuUsage: number;
  responseTime: number;
  errors: number;
}

export default function AgentMonitoringPage() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAgentStatus() {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/dashboard/agents/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setAgents(await res.json());
      } catch (error) {
        console.error('Error fetching agent status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
      active: { label: '运行中', cls: 'badge-success', icon: <CheckCircle2 size={11} strokeWidth={2.2} /> },
      idle: { label: '空闲', cls: 'badge-warning', icon: <Clock size={11} strokeWidth={2.2} /> },
      error: { label: '异常', cls: 'badge-danger', icon: <XCircle size={11} strokeWidth={2.2} /> },
    };
    const c = map[status] || { label: status, cls: 'badge-neutral', icon: null };
    return <span className={`badge ${c.cls}`}>{c.icon}{c.label}</span>;
  };

  if (loading) {
    return (
      <div className="fade-in-up">
        <div className="empty-state">
          <div className="empty-icon"><Cpu size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取坐席状态</div>
        </div>
      </div>
    );
  }

  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const avgResponseTime = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + a.responseTime, 0) / agents.length)
    : 0;
  const totalErrors = agents.reduce((sum, a) => sum + a.errors, 0);

  const statCards = [
    { label: '坐席总数', value: totalAgents, icon: Cpu, color: 'var(--accent)' },
    { label: '运行中', value: activeAgents, icon: CheckCircle2, color: 'var(--success)' },
    { label: '平均响应', value: `${avgResponseTime}ms`, icon: Clock, color: 'var(--info)' },
    { label: '错误数', value: totalErrors, icon: AlertCircle, color: totalErrors > 0 ? 'var(--danger)' : 'var(--text-tertiary)' },
  ];

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Monitoring</div>
          <h1>坐席监控</h1>
          <p className="page-subtitle">实时查看坐席状态、性能指标与健康度（每 30 秒刷新）</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{stat.label}</span>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: stat.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} strokeWidth={1.8} color={stat.color} />
                </div>
              </div>
              <div style={{
                fontSize: 26, fontWeight: 750, fontVariantNumeric: 'tabular-nums',
                color: stat.color, lineHeight: 1.1, letterSpacing: -0.5,
              }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={15} strokeWidth={1.8} color="var(--accent)" />
            <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: -0.1 }}>坐席状态</span>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Cpu size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">暂无坐席</div>
            <div className="empty-desc">配置第一个坐席后即可开始监控其性能与状态</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  {['名称', '状态', '会话数', '最近活跃', 'CPU', '内存', '响应时间', '错误'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{agent.name}</td>
                    <td>{getStatusBadge(agent.status)}</td>
                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{agent.conversations}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(agent.lastActive).toLocaleString()}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: agent.cpuUsage > 80 ? 'var(--danger)' : 'var(--text-primary)',
                      }}>
                        <Cpu size={14} strokeWidth={1.8} color="var(--text-tertiary)" />
                        {agent.cpuUsage}%
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)',
                      }}>
                        <MemoryStick size={14} strokeWidth={1.8} color="var(--text-tertiary)" />
                        {agent.memoryUsage}MB
                      </span>
                    </td>
                    <td style={{
                      fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      color: agent.responseTime > 1000 ? 'var(--warning)' : 'var(--text-primary)',
                    }}>
                      {agent.responseTime}ms
                    </td>
                    <td>
                      {agent.errors > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger)', fontWeight: 600 }}>
                          <AlertCircle size={14} strokeWidth={1.8} />
                          {agent.errors}
                        </span>
                      ) : (
                        <CheckCircle2 size={16} strokeWidth={1.8} color="var(--success)" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
