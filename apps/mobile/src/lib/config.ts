/**
 * 运行配置。API 基址来自 app.json 的 expo.extra.apiBaseUrl，
 * 可用环境变量 EXPO_PUBLIC_API_URL 覆盖（本地联调指向 http(s) 网关）。
 * 注意：客户端只持有 API 基址，绝不包含任何服务端 Secret。
 */
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? extra.apiBaseUrl ?? 'https://api.wan-wan.top';

/** 登录态有效期（与服务端 JWT 一致：7 天）。 */
export const SESSION_HINT_DAYS = 7;
