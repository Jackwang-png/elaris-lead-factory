/**
 * T2.4 — PaymentProvidersModule.
 *
 * Nest DI wiring for all payment provider adapters.
 *
 * Safety rule: all providers are skeletons in T2.4, so every provider is
 * registered with default config `enabled: false`. They will NOT be picked
 * by getDefault() / findAvailableProvider() until explicitly enabled in a
 * later task. No SDK, no HTTP, no secrets, no certificates.
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WechatPayProvider } from './providers/wechat/wechat-pay.provider';
import { AlipayProvider } from './providers/alipay/alipay.provider';
import { StripeProvider } from './providers/stripe/stripe.provider';
import { AggregatePaymentProvider } from './providers/aggregate/aggregate-payment.provider';
import { SelfHostedPaymentProvider } from './providers/selfhosted/selfhosted.provider';
import { NullPaymentProvider } from './providers/null.provider';
import { UnknownPaymentProvider } from './providers/unknown.provider';
import {
  PaymentProviderRegistry,
  createDefaultProviderConfig,
} from './providers/payment-provider.registry';

export const WECHAT_PAY_CONFIG = createDefaultProviderConfig('wechat', 30);
export const ALIPAY_CONFIG = createDefaultProviderConfig('alipay', 20);
export const STRIPE_CONFIG = createDefaultProviderConfig('stripe', 10);

@Module({
  // ConfigModule makes ConfigService resolvable here (MaPay provider config).
  imports: [ConfigModule],
  providers: [
    {
      provide: WechatPayProvider,
      useFactory: () => new WechatPayProvider(WECHAT_PAY_CONFIG),
    },
    {
      provide: AlipayProvider,
      useFactory: () => new AlipayProvider(ALIPAY_CONFIG),
    },
    {
      provide: StripeProvider,
      useFactory: () => new StripeProvider(STRIPE_CONFIG),
    },
    {
      provide: AggregatePaymentProvider,
      useFactory: (config: ConfigService) =>
        new AggregatePaymentProvider({
          ...createDefaultProviderConfig('aggregate', 40),
          enabled: config.get<string>('AGGREGATE_PAY_ENABLED') === 'true',
          merchantId: config.get<string>('MAPAY_PID'),
          apiKey: config.get<string>('MAPAY_KEY'),
          gatewayUrl: config.get<string>('MAPAY_API_BASE'),
          payType: config.get<string>('MAPAY_PAY_TYPE') ?? 'alipay',
          notifyUrl: config.get<string>('MAPAY_NOTIFY_URL') ?? '',
        }),
      inject: [ConfigService],
    },
    {
      provide: SelfHostedPaymentProvider,
      useFactory: (config: ConfigService) =>
        new SelfHostedPaymentProvider({
          ...createDefaultProviderConfig('selfhosted', 50),
          enabled: config.get<string>('SELFHOSTED_PAY_ENABLED') === 'true',
          cashierBaseUrl:
            config.get<string>('SELFHOSTED_CASHIER_BASE_URL') ??
            config.get<string>('PUBLIC_API_URL') ??
            'http://localhost:3000',
          qrChannel: config.get<string>('SELFHOSTED_QR_CHANNEL') ?? 'alipay',
        }),
      inject: [ConfigService],
    },
    {
      provide: NullPaymentProvider,
      useFactory: () =>
        new NullPaymentProvider(createDefaultProviderConfig('null', 0)),
    },
    {
      provide: UnknownPaymentProvider,
      useFactory: () =>
        new UnknownPaymentProvider(createDefaultProviderConfig('unknown', 0)),
    },
    {
      provide: PaymentProviderRegistry,
      useFactory: (
        wechat: WechatPayProvider,
        alipay: AlipayProvider,
        stripe: StripeProvider,
        aggregate: AggregatePaymentProvider,
        selfhosted: SelfHostedPaymentProvider,
        nullProvider: NullPaymentProvider,
        unknownProvider: UnknownPaymentProvider,
      ) => {
        const registry = new PaymentProviderRegistry({
          nullProvider,
          unknownProvider,
        });
        // Register real channel providers only — Null/Unknown stay as
        // fallbacks and never join the priority routing set.
        registry.register(wechat);
        registry.register(alipay);
        registry.register(stripe);
        registry.register(aggregate);
        registry.register(selfhosted);
        return registry;
      },
      inject: [
        WechatPayProvider,
        AlipayProvider,
        StripeProvider,
        AggregatePaymentProvider,
        SelfHostedPaymentProvider,
        NullPaymentProvider,
        UnknownPaymentProvider,
      ],
    },
  ],
  exports: [
    PaymentProviderRegistry,
    WechatPayProvider,
    AlipayProvider,
    StripeProvider,
    AggregatePaymentProvider,
    SelfHostedPaymentProvider,
    NullPaymentProvider,
    UnknownPaymentProvider,
  ],
})
export class PaymentProvidersModule {}
