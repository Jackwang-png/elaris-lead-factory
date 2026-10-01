import { Module } from '@nestjs/common';

import { HunterDiscoveryController } from './hunter-discovery.controller';
import { HunterIntelligenceService } from './hunter-intelligence.service';
import { HunterPersistenceService } from './hunter-persistence.service';
import { HunterPipelineService } from './hunter-pipeline.service';
import { DiscoveryService } from './discovery/discovery.service';
import { ManualSeedProvider } from './discovery/manual-seed.provider';
import { PageFetchService } from './discovery/page-fetch.service';
import { UrlSafetyService } from './discovery/url-safety.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Hunter module — the ONLY place where the elaris/** brain is consumed
 * (HunterIntelligenceService). No second qualification/scoring brain exists.
 *
 * v1 enables ManualSeedProvider only; search providers can be added later
 * without touching the business kernel.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HunterDiscoveryController],
  providers: [
    UrlSafetyService,
    ManualSeedProvider,
    {
      provide: PageFetchService,
      useFactory: (safety: UrlSafetyService) => new PageFetchService(safety),
      inject: [UrlSafetyService],
    },
    {
      provide: DiscoveryService,
      useFactory: (safety: UrlSafetyService, seed: ManualSeedProvider) =>
        new DiscoveryService([seed], safety),
      inject: [UrlSafetyService, ManualSeedProvider],
    },
    HunterIntelligenceService,
    HunterPersistenceService,
    HunterPipelineService,
  ],
  exports: [HunterPipelineService, HunterIntelligenceService],
})
export class HunterModule {}
