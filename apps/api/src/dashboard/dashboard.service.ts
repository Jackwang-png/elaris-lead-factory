import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dashboard 数据服务
 * 提供商家工作台首页、数据分析、代理监控所需的聚合数据
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** 商家工作台首页统计卡片数据 */
  async getStats(tenantId: string) {
    const [
      bots,
      conversations,
      customers,
      leads,
      messages,
    ] = await Promise.all([
      this.prisma.bot.count({ where: { tenantId } }),
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.message.count({ where: { tenantId } }),
    ]);

    // 今日对话数
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayConversations = await this.prisma.conversation.count({
      where: { tenantId, createdAt: { gte: todayStart } },
    });

    // 转化率 = 已转化线索 / 总线索
    const convertedLeads = await this.prisma.lead.count({
      where: { tenantId, status: 'WON' },
    });
    const conversionRate = leads > 0 ? Math.round((convertedLeads / leads) * 100) : 0;

    return {
      totalConversations: conversations,
      totalCustomers: customers,
      totalLeads: leads,
      conversionRate,
      revenue: 0, // 营收暂时返回 0，后续接入支付模块后计算
      avgResponseTime: 0, // 平均响应时间，后续接入监控后计算
      totalBots: bots,
      totalMessages: messages,
      todayConversations,
      todayDate: todayStart.toISOString().split('T')[0],
    };
  }

  /** 转化漏斗数据 */
  async getConversionData(tenantId: string) {
    const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'];
    const stageLabels: Record<string, string> = {
      NEW: '新线索',
      CONTACTED: '已联系',
      QUALIFIED: '已合格',
      PROPOSAL: '方案发送',
      NEGOTIATION: '谈判中',
      WON: '已成交',
    };

    const counts = await Promise.all(
      stages.map((stage) =>
        this.prisma.lead.count({ where: { tenantId, status: stage } }),
      ),
    );

    return stages.map((stage, i) => ({
      stage: stageLabels[stage],
      value: counts[i],
    }));
  }

  /** 最近 7 天对话趋势 */
  async getConversationData(tenantId: string) {
    const days: { date: string; conversations: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(now.getDate() - i);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const count = await this.prisma.conversation.count({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
      });

      days.push({
        date: `${start.getMonth() + 1}/${start.getDate()}`,
        conversations: count,
      });
    }

    return days;
  }

  /** 线索来源分布 */
  async getLeadSources(tenantId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId },
      select: { source: true },
    });

    const sourceMap: Record<string, number> = {};
    for (const lead of leads) {
      const src = lead.source || '未知';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    }

    return Object.entries(sourceMap).map(([source, value]) => ({ source, value }));
  }

  /** 代理/机器人运行状态 */
  async getAgentStatus(tenantId: string) {
    const bots = await this.prisma.bot.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
    });

    const now = new Date();

    return Promise.all(
      bots.map(async (bot) => {
        // 统计每个 bot 的会话数
        const conversations = await this.prisma.conversation.count({
          where: { tenantId, botId: bot.id },
        });

        // 计算最后活跃时间距现在的分钟数
        const lastActive = bot.updatedAt;
        const diffMin = Math.floor((now.getTime() - lastActive.getTime()) / 60000);

        // 5 分钟内有更新 = active，1 小时内 = idle，否则 = idle
        const status = diffMin < 5 ? 'active' : 'idle';

        // 模拟资源使用率（基于会话数量）
        const memoryUsage = Math.min(85, 20 + conversations * 2);
        const cpuUsage = Math.min(75, 10 + conversations * 1.5);
        const responseTime = 50 + Math.floor(Math.random() * 200);

        // 统计错误数（查找失败的审计日志）
        const errors = await this.prisma.auditLog.count({
          where: { tenantId, success: false, createdAt: { gte: new Date(now.getTime() - 86400000) } },
        });

        return {
          id: bot.id,
          name: bot.name,
          status,
          conversations,
          lastActive: lastActive.toISOString(),
          memoryUsage,
          cpuUsage,
          responseTime,
          errors,
        };
      }),
    );
  }
}
