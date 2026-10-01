import { Module } from '@nestjs/common';

import { HunterDiscoveryController } from './hunter-discovery.controller';
import { HunterIntelligenceService } from './hunter-intelligence.service';
import { HunterPersistenceService } from './hunter-persistence.service';
import { HunterPipelineService } from './hunter-pipeline.service';
import { DiscoveryService } from './discovery/discovery.service';
import { ManualSeedProvider } from './discovery/manual-seed.provider';
import { YouComSearchProvider } from './discovery/you-com.provider';
import { PageFetchService } from './discovery/page-fetch.service';
import { UrlSafetyService } from './discovery/url-safety.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Hunter module — the ONLY place where the elaris/** brain is consumed
 * (HunterIntelligenceService). No second qualification/scoring brain exists.
 *
 * Discovery providers are pluggable and vendor-agnostic: ManualSeedProvider
 * (operator seeds) and YouComSearchProvider (You.com Web Search) both feed the
 * same DiscoveryService. Adding/replacing a search vendor never touches the
 * business kernel.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HunterDiscoveryController],
  providers: [
    UrlSafetyService,
    ManualSeedProvider,
    YouComSearchProvider,
    {
      provide: PageFetchService,
      useFactory: (safety: UrlSafetyService) => new PageFetchService(safety),
      inject: [UrlSafetyService],
    },
    {
      provide: DiscoveryService,
      useFactory: (
        safety: UrlSafetyService,
        seed: ManualSeedProvider,
        youCom: YouComSearchProvider,
      ) => new DiscoveryService([seed, youCom], safety),
      inject: [UrlSafetyService, ManualSeedProvider, YouComSearchProvider],
    },
    HunterIntelligenceService,
    HunterPersistenceService,
    HunterPipelineService,
  ],
  exports: [HunterPipelineService, HunterIntelligenceService],
})
export class HunterModule {}
