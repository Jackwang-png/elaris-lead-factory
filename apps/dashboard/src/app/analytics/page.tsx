'use client';

import { useEffect, useState } from 'react';
import { Users, MessageSquare, Target, TrendingUp, DollarSign, Clock, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const COLORS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--info)', 'var(--danger)'];

interface DashboardStats {
  totalConversations: number;
  totalCustomers: number;
  totalLeads: number;
  conversionRate: number;
  revenue: number;
  avgResponseTime: number;
}

interface ChartData {
  date: string;
  conversations?: number;
  count?: number;
  value?: number;
  stage?: string;
}

interface LeadSourceData {
  source: string;
  value: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalConversations: 0,
    totalCustomers: 0,
    totalLeads: 0,
    conversionRate: 0,
    revenue: 0,
    avgResponseTime: 0,
  });
  const [conversationData, setConversationData] = useState<ChartData[]>([]);
  const [conversionData, setConversionData] = useState<ChartData[]>([]);
  const [leadSourceData, setLeadSourceData] = useState<LeadSourceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalyticsData() {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        const [statsRes, convRes, convDataRes, leadSourceRes] = await Promise.all([
          fetch(`${API}/dashboard/stats`, { headers }),
          fetch(`${API}/dashboard/conversion-data`, { headers }),
          fetch(`${API}/dashboard/conversation-data`, { headers }),
          fetch(`${API}/dashboard/lead-sources`, { headers }),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (convRes.ok) setConversionData(await convRes.json());
        if (convDataRes.ok) setConversationData(await convDataRes.json());
        if (leadSourceRes.ok) setLeadSourceData(await leadSourceRes.json());
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalyticsData();
  }, []);

  if (loading) {
    return (
      <div className="fade-in-up">
        <div className="empty-state">
          <div className="empty-icon"><BarChart3 size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取数据分析</div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: '总会话数', value: stats.totalConversations, icon: MessageSquare, color: 'var(--info)' },
    { label: '客户总数', value: stats.totalCustomers, icon: Users, color: 'var(--success)' },
    { label: '线索数', value: stats.totalLeads, icon: Target, color: 'var(--warning)' },
    { label: '转化率', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'var(--accent)' },
    { label: '营收', value: `¥${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'var(--success)' },
    { label: '平均响应', value: `${stats.avgResponseTime}ms`, icon: Clock, color: 'var(--danger)' },
  ];

  const tooltipStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    fontSize: 13,
    color: 'var(--text-primary)',
  };

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Analytics</div>
          <h1>数据分析</h1>
          <p className="page-subtitle">销售表现与客户参与度核心指标</p>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 18, letterSpacing: -0.1 }}>
            会话趋势
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Line
                  type="monotone"
                  dataKey="conversations"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={{ fill: 'var(--accent)', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="会话数"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 18, letterSpacing: -0.1 }}>
            转化漏斗
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis type="number" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="stage" type="category" width={100} stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Bar dataKey="count" fill="var(--success)" name="数量" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 18, letterSpacing: -0.1 }}>
          线索来源分布
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={leadSourceData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                innerRadius={48}
                dataKey="value"
                nameKey="source"
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
              >
                {leadSourceData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
