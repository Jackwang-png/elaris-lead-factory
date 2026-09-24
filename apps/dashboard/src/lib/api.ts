import axios from "axios";
import { clearAuthSession } from "@/lib/auth";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
});

// 请求拦截：注入 Bearer Token（仅客户端有 localStorage）
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 响应拦截：401（token 失效/过期）时清理凭证并跳转登录页
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      clearAuthSession();
      // 用 location.href 而非 router，确保 middleware 重新求值
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
