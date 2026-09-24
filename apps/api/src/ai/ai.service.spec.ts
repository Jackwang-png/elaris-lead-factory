import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { IntentService } from './pipeline/intent.service';
import { CustomerMemoryService } from './pipeline/customer-memory.service';
import { KnowledgeRetrievalService } from './pipeline/knowledge-retrieval.service';
import { RecommendationService } from './pipeline/recommendation.service';
import { LeadScoreService } from './pipeline/lead-score.service';
import { SalesStrategyService } from './pipeline/sales-strategy.service';
import { ResponseGenerationService } from './pipeline/response-generation.service';
import { SalesRulesService } from './pipeline/sales-rules.service';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderRegistry } from './providers/ai-provider.registry';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        IntentService,
        CustomerMemoryService,
        KnowledgeRetrievalService,
        RecommendationService,
        LeadScoreService,
        SalesStrategyService,
        ResponseGenerationService,
        SalesRulesService,
        {
          provide: AiProviderRegistry,
          useValue: {
            getDefault: jest.fn(() => ({
              chat: jest.fn(),
              generateStructured: jest.fn(),
              embed: jest.fn(),
              capabilities: jest.fn(),
            })),
            getConfig: jest.fn(() => ({})),
            get: jest.fn(),
            has: jest.fn(),
            getRegistered: jest.fn(() => []),
            getDefaultName: jest.fn(() => 'openai'),
          },
        },
        {
          provide: LeadsService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findByBotAndCustomer: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            bot: {
              findUnique: jest.fn(),
            },
            customerMemory: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            knowledge: {
              findMany: jest.fn(),
            },
            salesRule: {
              findMany: jest.fn(),
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
