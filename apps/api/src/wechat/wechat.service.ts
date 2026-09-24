import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WechatService {

  constructor(
    private aiService: AiService
  ) {}

  async reply(
    message: string,
    botId: string
  ) {
    if (!botId) {
      return "机器人未配置，请在 URL 后加 ?botId=xxx";
    }

    try {
      const result = await this.aiService.chat(
        message,
        '你是一个微信客服助手，负责回复客户问题。',
        [],
        botId
      );
      return result;
    } catch (e: any) {
      return '抱歉，服务暂时不可用';
    }
  }
}
