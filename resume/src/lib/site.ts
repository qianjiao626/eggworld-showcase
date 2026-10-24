/* 部署位置：静态导出产物挂在蛋蛋世界同域的 /rs/ 下（见 next.config.js 的
   output: 'export' + basePath），由 nginx 直接当静态文件服务 —— 本站没有自己的服务端。
   所以这里只剩两件事：找蛋蛋世界后端、拿同源的登录 token。 */

/** 部署前缀。⚠️ 与 next.config.js 的 basePath 必须保持一致。 */
export const BASE_PATH = "/rs";

/**
 * 蛋蛋世界后端根地址。规则与主站 growth-schoolv3.html 的 API_BASE 一致：
 * 本地联调（localhost / 127.0.0.1）走 8080，线上走同域根路径。
 */
export function apiBase(): string {
  if (typeof window === "undefined") return "";
  /* 与主站同款逃生口：本地验证时可临时指向别的后端端口（线上不设置，走同域） */
  const override = (window as any).EGGWORLD_API_BASE;
  if (typeof override === "string") return override;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8080";
  return "";
}

/**
 * 蛋蛋世界的登录 token（本站与主站同源，直接复用它的 sessionStorage 键）。
 * 未登录返回空串，调用方应提示「先登录蛋蛋世界」。
 */
export function authToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem("token") || "";
  } catch {
    return "";
  }
}

/** 当前登录用户 id（从 token 的 sub 解出来；没登录返回空串）。 */
export function currentUserId(): string {
  const token = authToken();
  if (!token) return "";
  try {
    const part = token.split(".")[1];
    if (!part) return "";
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const payload = JSON.parse(window.atob(base64));
    return payload && payload.sub != null ? String(payload.sub) : "";
  } catch {
    return "";
  }
}

/**
 * 按用户隔离 localStorage 键。
 * 简历原文 / 写简历草稿这些都是个人数据，换账号后必须读不到上一个账号的；
 * 未登录时退回原键（页面本身会先提示登录）。
 */
export function userScopedKey(key: string): string {
  const uid = currentUserId();
  return uid ? `${key}:u${uid}` : key;
}
