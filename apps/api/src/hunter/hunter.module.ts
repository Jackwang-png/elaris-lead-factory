import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { HunterDiscoveryController } from './hunter-discovery.controller';
import { HunterIntelligenceService } from './hunter-intelligence.service';
import { HunterPersistenceService } from './hunter-persistence.service';
import { HunterPipelineService } from './hunter-pipeline.service';
import { DiscoveryService } from './discovery/discovery.service';
import { ManualSeedProvider } from './discovery/manual-seed.provider';
import { PageFetchService } from './discovery/page-fetch.service';
import { UrlSafetyService } from './discovery/url-safety.service';
import { SearchProvider } from './discovery/search.provider';
import {
  SearchProviderConfig,
  loadSearchProviderConfig,
} from './discovery/search-provider.config';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Hunter module — the ONLY place where the elaris/** brain is consumed
 * (HunterIntelligenceService). No second qualification/scoring brain exists.
 *
 * Discovery is pluggable:
 *  - ManualSeedProvider is always enabled (operator-supplied URLs).
 *  - SearchProvider is the second adapter (search -> candidates). It is a thin
 *    HTTP adapter; the business kernel never learns the vendor or protocol.
 *    If its API key is absent it fails closed (throws), leaving ManualSeed usable.
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [HunterDiscoveryController],
  providers: [
    UrlSafetyService,
    ManualSeedProvider,
    {
      provide: SearchProviderConfig,
      useFactory: (config: ConfigService) =>
        loadSearchProviderConfig({
          SEARCH_PROVIDER_API_KEY: config.get<string>('SEARCH_PROVIDER_API_KEY'),
          SEARCH_PROVIDER_ENDPOINT: config.get<string>('SEARCH_PROVIDER_ENDPOINT'),
          SEARCH_PROVIDER_NAME: config.get<string>('SEARCH_PROVIDER_NAME'),
          SEARCH_PROVIDER_TIMEOUT_MS: config.get<string>('SEARCH_PROVIDER_TIMEOUT_MS'),
        }),
      inject: [ConfigService],
    },
    {
      provide: SearchProvider,
      useFactory: (cfg: SearchProviderConfig) => new SearchProvider(cfg),
      inject: [SearchProviderConfig],
    },
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
        search: SearchProvider,
      ) => new DiscoveryService([seed, search], safety),
      inject: [UrlSafetyService, ManualSeedProvider, SearchProvider],
    },
    HunterIntelligenceService,
    HunterPersistenceService,
    HunterPipelineService,
  ],
  exports: [HunterPipelineService, HunterIntelligenceService],
})
export class HunterModule {}
