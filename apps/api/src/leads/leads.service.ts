import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    score?: string;
    tenantId: string;
  }) {
    try {
      const { page, limit, search, status, score, tenantId } = params;
      const skip = (page - 1) * limit;

      const where: any = { tenantId };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (status && status !== 'all') {
        where.salesStatus = status;
      }

      if (score && score !== 'all') {
        if (score === 'high') where.intentScore = { gte: 80 };
        if (score === 'medium') where.intentScore = { gte: 50, lt: 80 };
        if (score === 'low') where.intentScore = { lt: 50 };
      }

      const [items, total] = await Promise.all([
        this.prisma.lead.findMany({
          where,
          skip,
          take: limit,
          orderBy: { lastContactAt: 'desc' },
        }),
        this.prisma.lead.count({ where }),
      ]);

      return { items, total };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch leads',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(dto: CreateLeadDto & { tenantId: string; botId: string; conversationId?: string }) {
    try {
      return await this.prisma.lead.create({
        data: {
          name: dto.name,
          email: dto.email || '',
          phone: dto.phone,
          tenantId: dto.tenantId,
          botId: dto.botId,
          conversationId: dto.conversationId,
          source: dto.source || 'manual',
          salesStatus: 'new',
          lastContactAt: new Date()
        },
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create lead',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async update(id: string, data: {
    intentScore?: number;
    intentLevel?: string;
    salesStatus?: string;
    remark?: string;
  }, tenantId: string) {
    try {
      return await this.prisma.lead.update({
        where: { id, tenantId },
        data: {
          intentScore: data.intentScore,
          intentLevel: data.intentLevel,
          salesStatus: data.salesStatus,
          remark: data.remark,
          lastContactAt: new Date(),
        },
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update lead',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async findByBotAndCustomer(botId: string, customerId: string, tenantId: string) {
    return this.prisma.lead.findFirst({
      where: {
        botId,
        tenantId,
        OR: [
          { name: customerId },
          { phone: customerId },
          { email: customerId },
        ],
      },
    });
  }
}
