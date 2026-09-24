"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Gift, Loader2, RefreshCw, Sparkles, Users } from "lucide-react";

/**
 * 增长中心（GROWTH-STAFF-08B）
 *
 * 全部数据来自真实后端接口，禁止 mock：
 *  - GET /subscription/current        → 试用状态、试用结束时间
 *  - GET /me/quota                    → 今日 AI 额度、已使用、剩余、重置时间
 *  - GET /subscription/referral-code  → 我的邀请码、邀请人数、累计奖励天数
 *
 * 若后端某字段暂未提供，则不展示该行（不编造）。
 */

interface QuotaState {
  dailyLimit?: number;
  used?: number;
  remaining?: number;
  resetAt?: string;
  enabled?: boolean;
}

interface SubscriptionState {
  status?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  plan?: { name?: string } | string | null;
}

interface ReferralState {
  code?: string;
  inviteCount?: number;
  referredCount?: number;
  rewardDays?: number;
  totalRewardDays?: number;
}

const TRIAL_LABEL: Record<string, string> = {
  trialing: "试用中",
  trial: "试用中",
  active: "已生效",
  expired: "试用已结束",
  canceled: "已取消",
  past_due: "逾期",
  none: "暂无订阅",
};

function formatTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function GrowthPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [referral, setReferral] = useState<ReferralState | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 三个接口并行拉取；任一失败整体进入错误态并可重试
      const [subRes, quotaRes, refRes] = await Promise.all([
        api.get("/subscription/current").catch(() => ({ data: null })),
        api.get("/me/quota").catch(() => ({ data: null })),
        api.get("/subscription/referral-code").catch(() => ({ data: null })),
      ]);
      setSub((subRes.data as SubscriptionState) || null);
      setQuota((quotaRes.data as QuotaState) || null);
      setReferral((refRes.data as ReferralState) || null);
    } catch {
      setError("暂时无法加载增长数据");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyCode() {
    const code = referral?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时不阻断 */
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

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-title">暂时无法加载</div>
        <div className="empty-desc">请稍后重试</div>
        <Button className="btn-ghost" style={{ marginTop: 16 }} onClick={load}>
          <RefreshCw size={15} /> 重新加载
        </Button>
      </div>
    );
  }

  const trialStatus = sub?.status ? TRIAL_LABEL[sub.status] || sub.status : "暂无订阅信息";
  const inviteCount = referral?.inviteCount ?? referral?.referredCount;
  const rewardDays = referral?.totalRewardDays ?? referral?.rewardDays;
  const quotaExhausted = quota?.remaining === 0;

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <h1>增长中心</h1>
          <div className="page-subtitle">查看试用状态、AI 额度与邀请奖励</div>
        </div>
        <Button className="btn-ghost" onClick={load}>
          <RefreshCw size={15} /> 刷新
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* 试用状态 */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Sparkles size={16} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>试用状态</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{trialStatus}</div>
          {sub?.trialEndsAt && (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              试用结束时间：{formatTime(sub.trialEndsAt)}
            </div>
          )}
          {sub?.currentPeriodEnd && (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              当前周期结束：{formatTime(sub.currentPeriodEnd)}
            </div>
          )}
        </div>

        {/* AI 额度 */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Sparkles size={16} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>今日 AI 额度</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {quota?.dailyLimit ?? "—"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            今日已使用：{quota?.used ?? "—"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            今日剩余：{quota?.remaining ?? "—"}
          </div>
          {quota?.resetAt && (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              额度重置时间：{formatTime(quota.resetAt)}
            </div>
          )}
          {quotaExhausted && (
            <div style={{ marginTop: 10 }}>
              <span className="badge badge-danger">今日 AI 额度已用尽</span>
            </div>
          )}
        </div>

        {/* 我的邀请码 */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Gift size={16} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>我的邀请码</span>
          </div>
          {referral?.code ? (
            <>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                {referral.code}
              </div>
              <Button className="btn-ghost" onClick={copyCode}>
                {copied ? "已复制" : "复制邀请码"}
              </Button>
              <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-tertiary)" }}>
                邀请人数：{inviteCount ?? "—"}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                累计奖励天数：{rewardDays ?? "—"}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              <div className="empty-icon">
                <Users size={20} />
              </div>
              <div className="empty-title">暂无邀请记录</div>
              <div className="empty-desc">邀请好友后可获得额外奖励天数</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
