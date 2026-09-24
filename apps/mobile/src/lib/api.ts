/**
 * API client：axios + Bearer + 401 处理。
 *
 * 安全要求：
 *   - token 从 SecureStore 读取（不落 AsyncStorage、不写日志）
 *   - 401 → 清空会话 → 交由 App shell 跳转登录
 *   - 不发送 tenantId / role（服务端 ValidationPipe 会对额外字段返回 400）
 */
import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from './config';
import { clearSession, getToken, notifySessionChanged } from './auth';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearSession();
      await notifySessionChanged();
    }
    return Promise.reject(error);
  },
);

/** 面向 UI 的安全文案（绝不回显服务端堆栈）。 */
export function describeApiError(error: unknown): string {
  const status = (error as AxiosError)?.response?.status;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 403) return '当前账号无权访问该数据。';
  if (status === 429) return '请求过于频繁，请稍后再试。';
  if (status === 503) return '数据暂时无法获取，请稍后再试。';
  if (status && status >= 500) return '服务暂时不可用，请稍后再试。';
  return '网络异常，请检查网络后重试。';
}
