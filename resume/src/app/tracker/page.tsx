"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { userScopedKey } from "@/lib/site";
import { 
  Plus,
  MoreHorizontal,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Trash2
} from "lucide-react";

export default function AppTrackerPage() {
  const [applications, setApplications] = useState<any[]>([]);

  // 从本地加载数据（按用户隔离，换账号不串数据）
  useEffect(() => {
    try { localStorage.removeItem("my_applications"); } catch {}
    const saved = localStorage.getItem(userScopedKey("my_applications"));
    if (saved) {
      setApplications(JSON.parse(saved));
    }
  }, []);

  // 更新职位状态
  const moveStatus = (id: string, nextStatus: string) => {
    const updated = applications.map(app => 
      app.id === id ? { ...app, status: nextStatus, date: "刚刚更新" } : app
    );
    setApplications(updated);
    localStorage.setItem(userScopedKey("my_applications"), JSON.stringify(updated));
  };

  // 删除记录
  const deleteApp = (id: string) => {
    const updated = applications.filter(app => app.id !== id);
    setApplications(updated);
    localStorage.setItem(userScopedKey("my_applications"), JSON.stringify(updated));
  };

  const COLUMNS = [
    { id: "wishlist", title: "准备中", color: "#78716c", next: "applied", nextLabel: "投递" },
    { id: "applied", title: "已投递", color: "#ea580c", next: "interview", nextLabel: "约面试" },
    { id: "interview", title: "面试中", color: "#0d9488", next: "closed", nextLabel: "拿 Offer" },
    { id: "closed", title: "已结束", color: "#a8a29e", next: null, nextLabel: "" }
  ];

  return (
    <div className="flex min-h-screen md:h-screen w-full flex-col md:flex-row md:overflow-hidden bg-[#fafaf9]">
      <Sidebar />

      <main className="flex-1 flex flex-col md:overflow-hidden">
        <header className="px-4 pt-5 pb-3 md:p-10 md:pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#292524]">投递进度追踪</h1>
            <p className="text-[#78716c] mt-2">点击卡片右侧按钮，一键推进你的求职进度</p>
          </div>
        </header>

        <div className="flex-1 overflow-x-auto px-4 pb-6 md:p-10 md:pt-0 flex gap-4 md:gap-6">
          {COLUMNS.map(column => {
            const items = applications.filter(app => app.status === column.id);
            return (
              <div key={column.id} className="w-80 flex-shrink-0 flex flex-col gap-4">
                <div className="flex items-center gap-2 px-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }}></div>
                  <h3 className="font-bold text-[#292524]">{column.title}</h3>
                  <span className="text-xs font-bold text-[#a8a29e] bg-[#f1f1f1] px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
                  {items.length === 0 ? (
                    <div className="py-10 border-2 border-dashed border-[#e7e5e4] rounded-2xl flex flex-col items-center justify-center text-gray-400 gap-2">
                      <p className="text-xs">暂无职位</p>
                    </div>
                  ) : (
                    items.map(app => (
                      <div 
                        key={app.id} 
                        className="p-5 bg-white rounded-2xl border border-[#e7e5e4] shadow-sm hover:shadow-md transition-all group relative"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="w-10 h-10 bg-[#f1f1f1] rounded-xl flex items-center justify-center text-[#78716c]">
                            <Building2 size={20} />
                          </div>
                          <button 
                            onClick={() => deleteApp(app.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        <h4 className="font-bold text-[#292524] text-[15px] mb-1">{app.role}</h4>
                        <p className="text-xs text-[#78716c] mb-4">{app.company}</p>
                        
                        <div className="pt-3 border-t border-[#f1f1f1] flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] text-[#a8a29e] font-medium">
                            <Clock size={12} />
                            {app.date}
                          </div>
                          
                          {column.next && (
                            <button 
                              onClick={() => moveStatus(app.id, column.next!)}
                              className="flex items-center gap-1 bg-[#ea580c]/10 text-[#ea580c] px-2 py-1 rounded-lg text-[10px] font-bold hover:bg-[#ea580c] hover:text-white transition-all"
                            >
                              {column.nextLabel}
                              <ArrowRight size={10} />
                            </button>
                          )}
                          
                          {column.id === 'closed' && (
                            <CheckCircle2 size={14} className="text-[#0d9488]" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
