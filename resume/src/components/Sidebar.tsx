"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, PenTool, FileEdit, History } from "lucide-react";
import { useEggUser } from "@/lib/egg-user";
import { BASE_PATH } from "@/lib/site";

export default function Sidebar() {
  const pathname = usePathname();
  const eggUser = useEggUser();

  /* usePathname 带部署前缀、也带末尾斜杠（trailingSlash），归一后再和菜单的 href 比，
     否则「写简历 / 改简历」永远没有选中态。 */
  const currentPath = (pathname || "")
    .replace(new RegExp(`^${BASE_PATH}(?=/|$)`), "")
    .replace(/\/+$/, "") || "/";

  const menuItems = [
    { name: "大师兄写简历", href: "/resume/create", icon: PenTool },
    { name: "大师兄改简历", href: "/resume", icon: FileEdit },
    { name: "历史对标", href: "/resume/history", icon: History },
  ];

  return (
    <aside className="w-full shrink-0 bg-[#f1f1f1] px-4 py-3 flex flex-col gap-3 border-b border-[#e7e5e4] md:w-64 md:h-screen md:sticky md:top-0 md:p-6 md:gap-10 md:border-b-0 md:border-r">
      {/* 移动端顶栏：品牌 + 余额 + 返回；桌面端仍是左侧竖栏 */}
      <div className="flex items-center justify-between gap-3 md:block">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-[#292524] md:text-xl md:px-2">
          <div className="w-1.5 h-5 bg-[#ea580c] rounded-full md:w-2 md:h-6"></div>
          大师兄牛啵
        </Link>
        <div className="flex items-center gap-2 md:hidden">
          {eggUser && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#c2410c] tabular-nums border border-[#e7e5e4]">
              蛋蛋币 {eggUser.points ?? "—"}
            </span>
          )}
          <a
            href="/#workshop"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#57534e]"
          >
            <ArrowLeft size={13} />
            返回
          </a>
        </div>
      </div>

      {/* 桌面端：返回入口在品牌上方 */}
      <a
        href="/#workshop"
        className="hidden md:flex items-center gap-1.5 text-[12.5px] font-semibold text-[#57534e] hover:text-[#292524] transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        返回蛋蛋世界
      </a>

      <div className="flex flex-col gap-8 flex-1">
        <nav className="grid grid-cols-3 gap-2 md:flex md:flex-col md:gap-2">
          <p className="hidden md:block text-[10px] font-black text-[#a8a29e] uppercase tracking-widest px-3 mb-2">主导航</p>
          {menuItems.map((item) => {
            const isActive = currentPath === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center gap-2 rounded-2xl transition-all cursor-pointer px-2 py-2.5 md:justify-start md:p-3.5 md:gap-3 ${
                  isActive
                    ? "bg-[#292524] text-white font-bold shadow-lg"
                    : "text-[#78716c] bg-white/60 md:bg-transparent hover:bg-white"
                }`}
              >
                <Icon size={16} className="shrink-0 md:hidden" />
                <Icon size={18} className="shrink-0 hidden md:block" />
                <span className="text-[11.5px] font-bold whitespace-nowrap md:text-[13px] md:font-normal">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* 蛋蛋世界身份 + 余额：从学生工坊内嵌进入时免二次登录，这里显示来源账号 */}
      {eggUser && (
        <div className="hidden md:flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[#e7e5e4]">
          <div className="w-8 h-8 rounded-full bg-[#ea580c] text-white text-[13px] font-black flex items-center justify-center shrink-0">
            {(eggUser.name || "蛋").slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-[#292524] truncate">{eggUser.name || "蛋蛋用户"}</p>
            <p className="text-[11px] text-[#78716c]">
              蛋蛋币 <span className="font-black text-[#c2410c] tabular-nums">{eggUser.points ?? "—"}</span>
            </p>
          </div>
        </div>
      )}

      <div className="hidden md:block mt-auto p-4 bg-white/50 rounded-2xl border border-white/80 text-center">
        <p className="text-[10px] text-[#a8a29e] font-medium leading-relaxed italic">“投递大厂，简历一定要针对岗位微调哦！”</p>
      </div>
    </aside>
  );
}
