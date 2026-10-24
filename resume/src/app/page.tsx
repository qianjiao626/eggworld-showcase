"use client";

import React from "react";
import Link from "next/link";
import { Target, ChevronRight, FileEdit, ArrowLeft } from "lucide-react";
import { useEggUser } from "@/lib/egg-user";

export default function HomePage() {
  const eggUser = useEggUser();

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-[#fafaf9] relative flex flex-col items-center p-6 md:p-12 py-20">
      {/* 从蛋蛋世界「学生工坊」跳进来的入口：首页也给一条回程 */}
      <a
        href="/#workshop"
        className="absolute left-6 top-6 z-20 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#78716c] hover:text-[#292524] transition-colors"
      >
        <ArrowLeft size={14} />
        返回蛋蛋世界
      </a>

      {/* 用户信息：昵称 + 蛋蛋币余额（余额唯一来源是蛋蛋世界后端） */}
      {eggUser && (
        <div className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full border border-[#e7e5e4] bg-white px-3 py-1.5 shadow-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ea580c] text-[11px] font-black text-white">
            {(eggUser.name || "蛋").slice(0, 1)}
          </span>
          <span className="text-[12.5px] font-bold text-[#292524]">{eggUser.name || "蛋蛋用户"}</span>
          <span className="text-[12.5px] font-black text-[#c2410c] tabular-nums">
            {eggUser.points ?? "—"} 蛋蛋币
          </span>
        </div>
      )}
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-orange-50/50 blur-[120px] rounded-full -z-10 translate-x-1/4 -translate-y-1/4" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-orange-50/30 blur-[100px] rounded-full -z-10 -translate-x-1/4 translate-y-1/4" />

      {/* 顶部标语 */}
      <div className="flex flex-col items-center text-center gap-6 mb-12 md:mb-20">
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-[900] text-[#292524] tracking-tighter leading-[1.1]">
          大师兄<span className="text-[#ea580c]">牛啵.com</span>
        </h1>
      </div>

      {/* 简历工具入口（职业测评已抽到蛋蛋世界「学生工坊」，这里不再重复放卡） */}
      <div className="w-full max-w-2xl z-10">

        <Link href="/resume/create" className="group">
          <div className="relative flex h-full min-h-[360px] flex-col gap-8 overflow-hidden rounded-2xl border-2 border-[#e7e5e4] bg-white p-6 transition-all duration-500 hover:border-black hover:shadow-2xl md:min-h-[460px] md:rounded-3xl md:p-12">
            <div className="absolute top-0 right-0 p-5 text-orange-100/70 transition-colors group-hover:text-orange-200 md:p-10 md:text-orange-100">
              <FileEdit size={96} strokeWidth={1} className="md:h-[140px] md:w-[140px]" />
            </div>

            <div className="flex flex-col gap-4 relative z-10">
              <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center text-white shadow-xl group-hover:bg-[#ea580c] transition-colors">
                <Target size={28} />
              </div>
              <h2 className="text-3xl font-black text-[#292524]">简历有难题？<br/>这里帮你一步搞定</h2>
            </div>

            <div className="flex flex-col gap-3 relative z-10">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <div className="w-2 h-2 bg-[#ea580c] rounded-full" />
                </div>
                <p className="text-[#78716c] font-bold text-sm leading-relaxed">
                  <span className="text-black">没简历：</span>3分钟生成一份可投递简历
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <div className="w-2 h-2 bg-[#ea580c] rounded-full" />
                </div>
                <p className="text-[#78716c] font-bold text-sm leading-relaxed">
                  <span className="text-black">有简历：</span>直接对标岗位，逐条告诉你问题和改进
                </p>
              </div>
            </div>

            <div className="relative z-10 mt-auto w-full md:w-fit">
              <div className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-black px-8 py-4 font-black text-white shadow-xl transition-all group-hover:bg-[#ea580c] md:w-fit">
                开始搞简历 <ChevronRight size={20} />
              </div>
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}
