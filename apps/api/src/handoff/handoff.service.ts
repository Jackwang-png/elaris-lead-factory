import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ServerChanService } from './serverchan.service';
import { AuditService } from '../audit/audit.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * 转人工客服（Human Handoff）服务。
 *
 * 职责：
 *  1. 判断 AI 回复是否需要转人工（unknown 意图 / 低置信度 / 兜底话术命中）
 *  2. 将会话标记为 needsHuman（工单），并记录触发原因
 *  3. 通过 Server酱推送微信通知管理员（异步、失败不阻断）
 *  4. 人工客服：查看待处理列表、回复（写 agent 消息 + 标记已处理）、标记已处理
 *
 * 可配置项（环境变量）：
 *  - HANDOFF_ENABLED=true|false（默认 true）
 *  - HANDOFF_CONFIDENCE_THRESHOLD=0.05（默认；分类器置信度低于该值转人工。
 *    注意：当前分类器关键词匹配的真实意图置信度仅 0.14~0.2，默认阈值只对
 *    零/极低置信度（=unknown）生效，避免正常问答误转人工；
 *    接入可用 LLM 分类后可调高，如 0.3~0.5）
 *  - HANDOFF_MESSAGE=「这个问题我暂时无法回答，已为您转接人工客服，请稍候～」
 *  - DASHBOARD_BASE_URL=https://admin.wan-wan.xyz（推送里的处理链接前缀）
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private serverChan: ServerChanService,
    private audit?: AuditService,
  ) {}

  /** 转人工总开关 */
  get enabled(): boolean {
    return (this.config.get<string>('HANDOFF_ENABLED') ?? 'true') !== 'false';
  }

  /** 置信度阈值（默认 0.05：仅零/极低置信度=unknown 触发；LLM 分类可用后可调高） */
  get confidenceThreshold(): number {
    const raw = this.config.get<string>('HANDOFF_CONFIDENCE_THRESHOLD');
    const n = parseFloat(raw || '0.05');
    return Number.isFinite(n) ? n : 0.05;
  }

  /** 转人工后回复用户的友好话术 */
  get handoffMessage(): string {
    return (
      this.config.get<string>('HANDOFF_MESSAGE') ||
      '这个问题我暂时无法回答，已为您转接人工客服，请稍候～'
    );
  }

  /** 推送通知中的处理链接前缀 */
  get dashboardBaseUrl(): string {
    return (
      this.config.get<string>('DASHBOARD_BASE_URL') ||
      'https://admin.wan-wan.xyz'
    );
  }

  /**
   * 判断是否需要转人工。
   * @param intent 意图分析结果
   * @param isFallback 响应生成是否命中兜底话术
   */
  shouldHandoff(
    intent: { intent?: string; confidence?: number },
    isFallback: boolean,
  ): boolean {
    if (!this.enabled) return false;
    if (intent?.intent === 'unknown') return true;
    const conf = typeof intent?.confidence === 'number' ? intent.confidence : 0;
    if (conf < this.confidenceThreshold) return true;
    if (isFallback) return true;
    return false;
  }

  /** 推导触发原因标签 */
  reasonOf(
    intent: { intent?: string; confidence?: number },
    isFallback: boolean,
  ): string {
    if (intent?.intent === 'unknown') return 'unknown_intent';
    const conf = typeof intent?.confidence === 'number' ? intent.confidence : 0;
    if (conf < this.confidenceThreshold) return 'low_confidence';
    if (isFallback) return 'fallback_response';
    return 'manual';
  }

  /** 将会话标记为转人工（幂等，失败抛异常） */
  async markHandoff(
    conversationId: string,
    tenantId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, tenantId },
      data: {
        needsHuman: true,
        handoffReason: reason,
        handoffAt: new Date(),
        // 重新转人工：清除历史认领/处理状态，避免历史认领人锁住新的 handoff
        claimedByUserId: null,
        claimedAt: null,
        resolvedAt: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 认领会话（原子操作）。
   * 仅当会话属于本租户、needsHuman=true、未解决、未被认领时才成功认领。
   * 使用 updateMany + 条件 where，保证并发只有一个成功（原子），不会出现双认领。
   */
  async claim(conversationId: string, tenantId: string, userId: string) {
    const result = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        tenantId,
        needsHuman: true,
        resolvedAt: null,
        claimedByUserId: null,
      },
      data: {
        claimedByUserId: userId,
        claimedAt: new Date(),
      },
    });

    if (result.count === 1) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      await this.audit
        ?.log({
          action: 'HANDOFF_CLAIMED',
          resource: 'Conversation',
          resourceId: conversationId,
          tenantId,
          userId,
          detail: { claimedByUserId: userId },
          success: true,
        })
        .catch(() => undefined);
      return conversation;
    }

    // 认领失败：区分原因，返回标准错误（findFirst 仅用于错误提示，不影响原子性）
    const exists = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { needsHuman: true, resolvedAt: true, claimedByUserId: true },
    });
    if (!exists) throw new NotFoundException('会话不存在');
    if (exists.resolvedAt) throw new ConflictException('会话已处理，无法认领');
    if (exists.claimedByUserId) throw new ConflictException('会话已被其他客服认领');
    if (!exists.needsHuman) throw new BadRequestException('会话不需要人工客服');
    throw new ConflictException('无法认领该会话');
  }

  /**
   * 通知管理员（Server酱微信推送）。
   * 内容：谁问了什么问题、已转人工、处理链接。失败不抛异常。
   */
  async notifyAdmin(opts: {
    conversationId: string;
    tenantId: string;
    question?: string;
  }): Promise<void> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: opts.conversationId },
        include: { customer: true },
      });
      if (!conversation) return;

      const who = conversation.customer?.name || conversation.visitor || conversation.id;
      const question = (opts.question || '').trim().slice(0, 300) || '(无内容)';
      const link = `${this.dashboardBaseUrl}/human-support?conversation=${conversation.id}`;
      const title = `【转人工】客户「${who}」需要人工客服`;
      const desp = [
        `**客户**：${who}`,
        `**问题**：${question}`,
        `**会话 ID**：${conversation.id}`,
        `**处理链接**：${link}`,
      ].join('\n\n');

      const ok = await this.serverChan.send(title, desp);
      if (!ok) {
        this.logger.warn(`转人工微信推送未送达（会话 ${conversation.id}）`);
      }
    } catch (e) {
      this.logger.warn(`转人工通知失败: ${e.message}`);
    }
  }

  /** 待人工处理会话列表（按转人工时间倒序） */
  async listPending(tenantId: string, opts?: { mine?: boolean; userId?: string }) {
    const where: any = { tenantId, needsHuman: true };
    if (opts?.mine) {
      // 我的待处理：我认领的 + 待认领的（claimable）
      where.OR = [{ claimedByUserId: opts.userId }, { claimedByUserId: null }];
    }
    return this.prisma.conversation.findMany({
      where,
      include: {
        bot: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { handoffAt: 'desc' },
    });
  }

  /** 待处理数量 */
  async pendingCount(tenantId: string): Promise<number> {
    return this.prisma.conversation.count({
      where: { tenantId, needsHuman: true },
    });
  }

  /**
   * 人工客服回复：写入 agent 消息 + 标记会话已处理（needsHuman=false）。
   * @returns 新写入的 agent 消息
   */
  async reply(
    conversationId: string,
    tenantId: string,
    content: string,
    agentUserId?: string,
    role?: string,
  ) {
    const text = (content || '').trim();
    if (!text) throw new BadRequestException('回复内容不能为空');

    // 在事务内重新读取并写入，并把 ownership 条件纳入最终 updateMany 的 WHERE，
    // 避免「先读后写」的 TOCTOU 竞态被绕过（如 A 读取为未认领、B 同时 claim，A 仍能写）。
    let claimedByUserId: string | null = null;
    const message = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, tenantId },
      });
      if (!conversation) throw new NotFoundException('会话不存在');

      // 归属校验：已被他人认领的会话，仅 OWNER(merchant) 可回复
      if (role !== 'merchant') {
        if (conversation.claimedByUserId && conversation.claimedByUserId !== agentUserId) {
          throw new ForbiddenException('不能回复其他客服已认领的会话');
        }
      }
      claimedByUserId = conversation.claimedByUserId;

      const msg = await tx.message.create({
        data: {
          id: uuidv4(),
          conversationId,
          content: text,
          sender: 'agent',
          direction: 'outbound',
          role: 'agent',
          tenantId,
          metadata: { agentUserId: agentUserId || null, via: 'human-support' },
        },
      });

      // 原子校验：将 ownership 纳入 WHERE。
      // 注意：Prisma 的 `in` 不接受 null 元素，故用 OR 表达「自己认领或未认领」。
      // CUSTOMER_SERVICE 仅可作用于「自己认领或未认领」的会话；
      // 若并发 claim 改变了归属，updateMany 影响 0 行 → 抛错并回滚整个事务（消息不会被持久化）。
      const ownershipOr: any[] = [{ claimedByUserId: null }];
      if (agentUserId) ownershipOr.push({ claimedByUserId: agentUserId });
      const upd = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          tenantId,
          ...(role !== 'merchant' ? { OR: ownershipOr } : {}),
        },
        data: { needsHuman: false, resolvedAt: new Date(), updatedAt: new Date() },
      });
      if (upd.count === 0) {
        throw new ForbiddenException('会话归属已变更，无法回复');
      }
      return msg;
    });

    await this.audit
      ?.log({
        action: 'HANDOFF_REPLY',
        resource: 'Conversation',
        resourceId: conversationId,
        tenantId,
        userId: agentUserId,
        detail: { claimedByUserId },
        success: true,
      })
      .catch(() => undefined);

    return message;
  }

  /** 标记已处理（不回复） */
  async resolve(conversationId: string, tenantId: string, userId?: string, role?: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) throw new NotFoundException('会话不存在');

    // 原子写：将 ownership 条件纳入 WHERE。
    // OWNER(merchant) 仅受租户隔离约束；CUSTOMER_SERVICE 仅可处理「自己认领或未认领」的会话。
    const where: any = { id: conversationId, tenantId };
    if (role !== 'merchant') {
      // Prisma 的 `in` 不接受 null 元素，用 OR 表达「自己认领或未认领」
      const ownershipOr: any[] = [{ claimedByUserId: null }];
      if (userId) ownershipOr.push({ claimedByUserId: userId });
      where.OR = ownershipOr;
    }
    const upd = await this.prisma.conversation.updateMany({
      where,
      data: { needsHuman: false, resolvedAt: new Date(), updatedAt: new Date() },
    });
    if (upd.count === 0) {
      // 读取后归属/存在性发生变化：区分原因返回标准错误（不影响原子性）
      const current = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { claimedByUserId: true, resolvedAt: true },
      });
      if (!current) throw new NotFoundException('会话不存在');
      if (current.resolvedAt) throw new ConflictException('会话已处理，无法操作');
      if (current.claimedByUserId) throw new ForbiddenException('不能处理其他客服已认领的会话');
      throw new ForbiddenException('不能处理其他客服已认领的会话');
    }

    // 保留 claimedByUserId / claimedAt（不清除历史状态）
    const updated = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    await this.audit
      ?.log({
        action: 'HANDOFF_RESOLVED',
        resource: 'Conversation',
        resourceId: conversationId,
        tenantId,
        userId,
        detail: { claimedByUserId: conversation.claimedByUserId },
        success: true,
      })
      .catch(() => undefined);
    return updated;
  }
}
