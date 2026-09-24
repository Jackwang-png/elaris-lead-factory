import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBotDto } from './dto/create-bot.dto';

@Injectable()
export class BotsService {
  constructor(
    private prisma: PrismaService
  ) {}

  create(
    tenantId: string,
    dto: CreateBotDto
  ) {
    return this.prisma.bot.create({
      data: {
        name: dto.name,
        description: dto.description,
        model: dto.model || 'deepseek-chat',
        systemPrompt: dto.systemPrompt,
        tenantId
      }
    });
  }

  findAll(
    tenantId: string
  ) {
    return this.prisma.bot.findMany({
      where: {
        tenantId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  findOne(
    id: string,
    tenantId: string
  ) {
    return this.prisma.bot.findFirst({
      where: {
        id,
        tenantId
      }
    });
  }

  update(
    id: string,
    tenantId: string,
    dto: CreateBotDto
  ) {
    return this.prisma.bot.update({
      where: {
        id,
        tenantId
      },
      data: dto
    });
  }

  remove(
    id: string,
    tenantId: string
  ) {
    return this.prisma.bot.delete({
      where: {
        id,
        tenantId
      }
    });
  }
}
