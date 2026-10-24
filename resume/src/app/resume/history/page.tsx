"use client";

/* 历史对标：侧栏独立入口。
   每次成功的深度对标都落在蛋蛋世界后端；点任意一条会把 id 交给「大师兄改简历」，
   由那边载入原文 / JD / 报告继续改。 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Dialog, { DialogState } from "@/components/Dialog";
import { apiBase, authToken, userScopedKey } from "@/lib/site";
import { ChevronRight, History } from "lucide-react";

export default function ResumeHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    (async () => {
      const token = authToken();
      if (!token) {
        setLoading(false);
        setDialog({
          tone: "warn",
          title: "还没登录蛋蛋世界",
          description: "从蛋蛋世界的「学生工坊」进入简历站，才能看到自己的对标记录。",
        });
        return;
      }
      try {
        const res = await fetch(apiBase() + "/api/resume/analyses", {
          headers: { Authorization: "Bearer " + token },
        });
        const json = await res.json();
        if (json.code === 200) {
          setRows(Array.isArray(json.data) ? json.data : []);
        } else {
          setDialog({ tone: "warn", title: "历史记录没取到", description: json.msg || "请稍后再试。" });
        }
      } catch {
        setDialog({ tone: "warn", title: "历史记录没取到", description: "网络不太稳，请稍后再试。" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalCost = rows.reduce((sum: number, row: any) => sum + (Number(row.cost) || 0), 0);

  /* 交给改简历页读：同源 localStorage，进去后立即清掉；键按用户隔离，避免串号 */
  const openRecord = (id: number) => {
    try { localStorage.setItem(userScopedKey("open_analysis_id"), String(id)); } catch { /* 隐私模式下退化为普通跳转 */ }
    router.push("/resume");
  };

  return (
    <div className="flex min-h-screen md:h-screen w-full flex-col md:flex-row md:overflow-hidden bg-[#fafaf9]">
      <Sidebar />

      <main className="flex-1 flex flex-col md:overflow-hidden">
        <header className="px-4 py-4 md:px-10 md:py-6 border-b border-[#e7e5e4] bg-white">
          <h1 className="text-xl font-black text-[#292524]">历史对标</h1>
          <p className="mt-1 text-xs text-[#78716c]">每次成功对标都会留档；点任意一条，回到「大师兄改简历」继续改。</p>
        </header>

        <div className="flex-1 p-4 md:p-10 md:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {loading ? (
              <div className="mt-16 text-center text-[12.5px] text-[#a8a29e]">正在读取…</div>
            ) : rows.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f1f1f1] text-[#a8a29e]">
                  <History size={28} />
                </div>
                <p className="mt-2 text-sm font-black text-[#292524]">还没有对标记录</p>
                <p className="text-[12.5px] text-[#78716c]">放一份简历 + 一个目标岗位，第一次对标大约 10–30 秒。</p>
                <button
                  onClick={() => router.push("/resume")}
                  className="mt-3 h-11 rounded-2xl bg-[#ea580c] px-6 text-[13px] font-black text-white shadow-lg shadow-orange-100 transition-transform hover:scale-[1.02]"
                >
                  去做第一次对标
                </button>
              </div>
            ) : (
              <>
                {/* 总览：次数 / 花费 / 最近一次得分 */}
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="rounded-2xl md:rounded-[2rem] border border-[#e7e5e4] bg-white px-3 py-4 md:px-7 md:py-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e]">对标次数</p>
                    <p className="mt-2 text-2xl md:text-[32px] font-black leading-none tabular-nums text-[#292524]">{rows.length}</p>
                    <p className="mt-2 text-[11.5px] text-[#a8a29e]">每次成功对标都留档</p>
                  </div>
                  <div className="rounded-2xl md:rounded-[2rem] border border-[#e7e5e4] bg-white px-3 py-4 md:px-7 md:py-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e]">累计消耗</p>
                    <p className="mt-2 text-2xl md:text-[32px] font-black leading-none tabular-nums text-[#292524]">
                      {totalCost}
                      <span className="ml-1 text-[12px] font-bold text-[#78716c]">蛋蛋币</span>
                    </p>
                    <p className="mt-2 text-[11.5px] text-[#a8a29e]">失败会自动退回</p>
                  </div>
                  <div className="rounded-2xl md:rounded-[2rem] bg-[#292524] px-3 py-4 md:px-7 md:py-6 text-white">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">最近一次匹配分</p>
                    <p className="mt-2 text-2xl md:text-[32px] font-black leading-none tabular-nums text-[#ea580c]">{rows[0].score ?? "—"}</p>
                    <p className="mt-2 text-[11.5px] text-white/40">{rows[0].createdAt}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {rows.map((row: any) => (
                    <button
                      key={row.id}
                      onClick={() => openRecord(row.id)}
                      className="group flex items-center gap-3 md:gap-6 rounded-2xl md:rounded-[2rem] border border-[#e7e5e4] bg-white px-4 py-4 md:px-7 md:py-5 text-left shadow-sm transition-all hover:border-[#292524] hover:shadow-lg"
                    >
                      <span className="w-12 md:w-14 shrink-0 text-center">
                        <span className="block text-2xl md:text-[30px] font-black leading-none tabular-nums text-[#ea580c]">
                          {row.score ?? "—"}
                        </span>
                        <span className="mt-1.5 block text-[10px] font-black tracking-widest text-[#a8a29e]">匹配分</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold leading-relaxed text-[#292524] line-clamp-2">
                          {row.summary || "简历对标"}
                        </span>
                        <span className="mt-1.5 block text-[11.5px] text-[#a8a29e]">
                          {row.createdAt} · {Number(row.cost) > 0 ? `消耗 ${row.cost} 蛋蛋币` : "免费"}
                        </span>
                      </span>
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-[#d6d3d1] transition-colors group-hover:text-[#292524]"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
