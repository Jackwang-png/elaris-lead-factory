import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Server酱（方糖）微信推送服务。
 *
 * key 来源优先级：SERVERCHAN_KEY 环境变量 > /root/.serverchan_key 文件。
 * 约定：key 不写入日志、不写入代码（测试 mock 除外）、不写入报告。
 * 未配置 key 时静默跳过，不影响主业务流程。
 */
@Injectable()
export class ServerChanService {
  private readonly logger = new Logger(ServerChanService.name);

  /** 读取 ServerChan key（不打印） */
  private loadKey(): string | null {
    const envKey = process.env.SERVERCHAN_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
    try {
      if (existsSync('/root/.serverchan_key')) {
        const k = readFileSync('/root/.serverchan_key', 'utf8').trim();
        if (k) return k;
      }
    } catch (e) {
      this.logger.warn(`读取 ServerChan key 失败: ${e.message}`);
    }
    return null;
  }

  /**
   * 推送微信消息。
   * @param title 标题（≤32 字最佳）
   * @param desp 内容（支持 Markdown）
   * @returns 是否推送成功
   */
  async send(title: string, desp: string): Promise<boolean> {
    const key = this.loadKey();
    if (!key) {
      this.logger.warn('ServerChan key 未配置（SERVERCHAN_KEY / /root/.serverchan_key），跳过微信推送');
      return false;
    }
    try {
      // 5 秒超时，避免阻塞主流程
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ title: String(title), desp: String(desp) }),
          signal: controller.signal,
        });
        if (!res.ok) {
          this.logger.warn(`ServerChan 推送失败: HTTP ${res.status}`);
          return false;
        }
        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      this.logger.warn(`ServerChan 推送异常: ${e.message}`);
      return false;
    }
  }
}
