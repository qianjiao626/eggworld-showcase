"use client";

/* 从蛋蛋世界「学生工坊」点进来时是同一标签的同源跳转，所以蛋蛋世界的登录 token
   就在同一个 sessionStorage 里。用它换出当前用户（昵称 + 蛋蛋币余额）。
   AI 对标也用同一个 token，不需要再登录一次。 */

import { useEffect, useState } from "react";
import { apiBase, authToken } from "@/lib/site";

export type EggUser = {
  name?: string;
  points?: number;
};

const REFRESH_EVENT = "egg-account-refresh";

/** 余额变动后（比如刚扣了 50 币）通知所有展示用户信息的地方重新拉一次。 */
export function refreshAccount(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function useEggUser(): EggUser | null {
  const [user, setUser] = useState<EggUser | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(REFRESH_EVENT, bump);
    return () => window.removeEventListener(REFRESH_EVENT, bump);
  }, []);

  useEffect(() => {
    const token = authToken();
    if (!token) return;

    let alive = true;
    fetch(apiBase() + "/api/users/me", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((res) => res.json())
      .then((json) => {
        if (!alive || !json || json.code !== 200 || !json.data) return;
        setUser({
          name: json.data.nickname || "",
          points: Number(json.data.points) || 0,
        });
      })
      .catch(() => {
        /* 拿不到就按「未识别身份」处理，不影响简历工具本身 */
      });

    return () => {
      alive = false;
    };
  }, [version]);

  return user;
}
