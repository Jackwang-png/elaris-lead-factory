import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TenantModule } from './tenant/tenant.module';
import { BotsModule } from './bots/bots.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { ChannelModule } from './channel/channel.module';
import { ProductsModule } from './products/products.module';
import { CustomerModule } from './customer/customer.module';
import { UsageModule } from './usage/usage.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AdminModule } from './admin/admin.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { PaymentModule } from './payment/payment.module';
import { WechatModule } from './wechat/wechat.module';
import { ConversationsModule } from './conversations/conversations.module';
import { LeadsModule } from './leads/leads.module';
import { CustomersModule } from './customers/customers.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HandoffModule } from './handoff/handoff.module';
import { WidgetModule } from './widget/widget.module';
import { DouyinModule } from './douyin/douyin.module';
import { XiaohongshuModule } from './xiaohongshu/xiaohongshu.module';
import { WorkforceModule } from './workforce/workforce.module';
import { LeadIntelligenceModule } from './lead-intelligence/lead-intelligence.module';
import { HunterModule } from './hunter/hunter.module';
import { QuotaModule } from './quota/quota.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    TenantModule,
    BotsModule,
    AiModule,
    ChatModule,
    ChannelModule,
    ProductsModule,
    CustomerModule,
    UsageModule,
    KnowledgeModule,
    AdminModule,
    SubscriptionModule,
    PaymentModule,
    WechatModule,
    LeadsModule,
    ConversationsModule,
    CustomersModule,
    AuditModule,
    DashboardModule,
    SettingsModule,
    NotificationsModule,
    HandoffModule,
    WidgetModule,
    DouyinModule,
    XiaohongshuModule,
    WorkforceModule,
    LeadIntelligenceModule,
    HunterModule,
    QuotaModule,
    StaffModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
