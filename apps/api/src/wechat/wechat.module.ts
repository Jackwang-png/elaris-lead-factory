import { Module } from '@nestjs/common';

import { WechatController } from './wechat.controller';

import { WechatService } from './wechat.service';

import { AiModule } from '../ai/ai.module';
import { ChannelModule } from '../channel/channel.module';



@Module({

 imports:[
  AiModule,
  ChannelModule
 ],


 controllers:[
  WechatController
 ],


 providers:[
  WechatService
 ]

})
export class WechatModule {}
