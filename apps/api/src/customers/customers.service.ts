import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    tenantId: string;
  }) {
    try {
      const { page, limit, search, status, tenantId } = params;
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
        where.status = status;
      }

      const [items, total] = await Promise.all([
        this.prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { lastContactAt: 'desc' },
          include: {
            conversations: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { id: true, createdAt: true }
            }
          }
        }),
        this.prisma.customer.count({ where }),
      ]);

      return {
        items: items.map(item => ({
          ...item,
          tags: item.tags,
          lastConversation: item.conversations[0]?.createdAt
        })),
        total
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch customers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(dto: CreateCustomerDto & { tenantId: string; botId?: string }) {
    try {
      return await this.prisma.customer.create({
        data: {
          name: dto.name,
          email: dto.email || '',
          phone: dto.phone || '',
          tenantId: dto.tenantId,
          botId: dto.botId,
          status: dto.status || 'active',
          lastContactAt: new Date(),
          tags: dto.tags || []
        },

      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create customer',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async findById(id: string, tenantId: string) {
    try {
      return await this.prisma.customer.findUnique({
        where: { id, tenantId },
        include: {
          conversations: {
            orderBy: { createdAt: 'desc' },
            include: {
              messages: {
                orderBy: { createdAt: 'asc' },
                take: 50
              }
            }
          },
          leads: true
        }
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch customer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: Partial<CreateCustomerDto>, tenantId: string) {
    try {
      return await this.prisma.customer.update({
        where: { id, tenantId },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          status: dto.status,
          lastContactAt: new Date(),
          tags: dto.tags || undefined
        },

      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update customer',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
