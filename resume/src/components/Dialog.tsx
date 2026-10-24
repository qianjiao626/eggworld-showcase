"use client";

/* 站内统一弹窗：替代浏览器原生 alert/confirm。
   外观跟随简历站自己的语言（白卡 + 2.5rem 圆角 + 橙色主操作 + 衬线黑标题），
   扣币这类会有实际损失的操作用 confirm 形态，把「本次消耗 / 当前余额」直接写在弹窗里。 */

import { useEffect, useRef } from "react";
import { AlertCircle, Sparkles, X } from "lucide-react";

export type DialogState = {
  tone?: "confirm" | "warn";
  title: string;
  description?: string;
  bill?: { cost: number; balance?: number };
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
} | null;

export default function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    primaryRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;
  const tone = state.tone || "confirm";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="dialog-backdrop absolute inset-0 bg-[#292524]/45 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="dialog-panel relative w-full max-w-[430px] rounded-[2.5rem] bg-white p-9 shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-5 top-5 text-[#a8a29e] hover:text-[#292524] transition-colors"
        >
          <X size={18} />
        </button>

        <div
          className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${
            tone === "warn" ? "bg-red-50 text-red-500" : "bg-orange-50 text-[#ea580c]"
          }`}
        >
          {tone === "warn" ? <AlertCircle size={26} /> : <Sparkles size={26} />}
        </div>

        <h2 id="dialog-title" className="mt-5 text-xl font-black leading-snug text-[#292524]">
          {state.title}
        </h2>
        {state.description && (
          <p className="mt-2 text-[13px] leading-relaxed text-[#78716c]">{state.description}</p>
        )}

        {state.bill && (
          <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-[#fafaf9] px-4 py-3">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[#78716c]">本次消耗</span>
              <span className="font-black tabular-nums text-[#c2410c]">{state.bill.cost} 蛋蛋币</span>
            </div>
            {typeof state.bill.balance === "number" && (
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#78716c]">当前余额</span>
                <span className="font-bold tabular-nums text-[#292524]">{state.bill.balance} 蛋蛋币</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-7 flex gap-3">
          {tone === "confirm" && (
            <button
              onClick={onClose}
              className="h-12 flex-1 rounded-2xl border border-[#e7e5e4] text-sm font-black text-[#78716c] transition-colors hover:bg-[#fafaf9]"
            >
              {state.cancelText || "再想想"}
            </button>
          )}
          <button
            ref={primaryRef}
            onClick={() => {
              const run = state.onConfirm;
              onClose();
              run?.();
            }}
            className="h-12 flex-1 rounded-2xl bg-[#ea580c] text-sm font-black text-white shadow-lg shadow-orange-100 transition-opacity hover:opacity-90"
          >
            {state.confirmText || (tone === "warn" ? "知道了" : "确认")}
          </button>
        </div>
      </div>
    </div>
  );
}
