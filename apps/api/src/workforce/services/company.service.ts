import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkforceContext } from '../workforce.types';

export interface CompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: string;
  region?: string;
  description?: string;
  source?: string;
  icpScore?: number;
}

/**
 * P0-3 Company 服务。
 *
 * normalizedName 自动生成：去空格 / 小写 / 统一后缀（移除常见公司法律后缀）。
 * Entity Resolution：优先 normalizedName 精确匹配，其次 domain 匹配，
 * 未命中则新建（source 标记来源：scout / manual 等）。
 */
@Injectable()
export class CompanyService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
  ) {}

  /** 生成规范化名称：小写、去空白、去常见法律后缀 */
  normalizeName(name: string): string {
    let n = String(name || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。,.、;；:：()（）\[\]【】]/g, '');
    // 统一后缀（中文 + 英文常见法人实体后缀，从尾部剥离）
    const suffixes = [
      '股份有限公司',
      '有限责任公司',
      '有限公司',
      '集团公司',
      '集团',
      '股份公司',
      '有限公司分公司',
      '有限责任公司分公司',
      'incorp',
      'incorporated',
      'corporation',
      'corp',
      'limited',
      'ltd',
      'llc',
      'gmbh',
      'co',
      'company',
      'inc',
      'sarl',
      'plc',
    ];
    let changed = true;
    while (changed && n.length > 1) {
      changed = false;
      for (const s of suffixes) {
        if (n.endsWith(s) && n.length > s.length) {
          n = n.slice(0, -s.length);
          changed = true;
        }
      }
    }
    return n.replace(/[-_]/g, '').trim() || String(name || '').toLowerCase();
  }

  /** Entity Resolution：normalizedName / domain 匹配，未命中则新建 */
  async findOrCreate(tenantId: string, input: CompanyInput, ctx: WorkforceContext) {
    const normalizedName = this.normalizeName(input.name);
    if (!normalizedName) {
      throw new BadRequestException('Company name is required');
    }

    let company = await this.prisma.company.findFirst({
      where: { tenantId, normalizedName },
    });
    if (!company && input.domain) {
      company = await this.prisma.company.findFirst({
        where: { tenantId, domain: input.domain.toLowerCase().replace(/^https?:\/\//, '') },
      });
    }
    if (!company) {
      company = await this.create(tenantId, input, ctx, { normalizedName });
    } else if (input.icpScore != null && input.icpScore > (company.icpScore ?? 0)) {
      // 新信号 icpScore 更高时提升
      company = await this.prisma.company.update({
        where: { id: company.id },
        data: { icpScore: input.icpScore },
      });
    }
    return company;
  }

  async create(
    tenantId: string,
    input: CompanyInput,
    ctx: WorkforceContext,
    opts?: { normalizedName?: string },
  ) {
    const normalizedName = opts?.normalizedName || this.normalizeName(input.name);
    const domain = input.domain
      ? input.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : null;

    const company = await this.prisma.company.create({
      data: {
        name: input.name,
        normalizedName,
        domain,
        industry: input.industry || null,
        size: input.size || null,
        website: input.website || null,
        address: input.address || null,
        region: input.region || null,
        description: input.description || null,
        source: input.source || 'manual',
        icpScore: input.icpScore ?? null,
        tenantId,
      },
    });

    await this.audit.log({
      action: 'COMPANY_CREATE',
      resource: 'Company',
      resourceId: company.id,
      tenantId,
      userId: ctx.userId,
      detail: {
        name: company.name,
        normalizedName,
        domain,
        industry: company.industry,
        source: company.source,
        icpScore: company.icpScore,
      },
      actorType: ctx.actorType,
      source: ctx.source,
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return company;
  }

  async list(tenantId: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    industry?: string;
    region?: string;
    source?: string;
    minIcpScore?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const { search, industry, region, source } = query;
    const minIcpScore = query.minIcpScore != null ? Number(query.minIcpScore) : undefined;
    const where: any = { tenantId };
    if (industry) where.industry = industry;
    if (region) where.region = region;
    if (source) where.source = source;
    if (minIcpScore != null) where.icpScore = { gte: Number(minIcpScore) };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { normalizedName: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { leads: true, signals: true, opportunities: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(tenantId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
      include: {
        leads: { orderBy: { createdAt: 'desc' }, take: 10 },
        signals: { orderBy: { detectedAt: 'desc' }, take: 10 },
        opportunities: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
