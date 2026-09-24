import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesRulesService {
  constructor(private prisma: PrismaService) {}

  async getRules(botId: string) {
    return this.prisma.salesRule.findMany({
      where: { botId },
    });
  }

  async createRule(botId: string, name: string, content: string, type: string = 'script') {
    return this.prisma.salesRule.create({
      data: { botId, name, content, type },
    });
  }
}
