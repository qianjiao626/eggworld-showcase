"use client";

import React, { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  CheckCircle, AlertCircle, Sparkles, RotateCcw, 
  FileText, Loader2, Upload, FileUp, Trophy, Target, ShieldCheck, Zap,
  Eye, X, QrCode, MessageCircle, FileCode
} from "lucide-react";

import { apiBase, authToken, userScopedKey } from "@/lib/site";
import { refreshAccount } from "@/lib/egg-user";
import { resumeDataToText } from "@/lib/resume-text";
import Dialog, { DialogState } from "@/components/Dialog";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/* 后端 /api/resume/meta 下发的计费与次数：
   chargeEnabled=false 时 analyzeCost 为 0（免费），listPrice 是恢复收费后的价格；
   dailyLimit=0 表示不限次数，此时不下发 todayLeft。 */
type ResumeMeta = {
  analyzeCost: number;
  listPrice?: number;
  chargeEnabled?: boolean;
  dailyLimit?: number;
  todayUsed?: number;
  todayLeft?: number;
  balance: number;
};

export default function ResumeOptimizerPage() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [meta, setMeta] = useState<ResumeMeta | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* 只有从「写简历 → 帮我深度评审和修改这份简历」带过来的草稿才预填；
       从侧栏「大师兄改简历」直接进入时保持空白，不回放上次的内容。
       草稿键按用户 id 隔离，旧版未隔离的键直接清掉，避免换账号串数据。 */
    let draftKey = "diagnosis_resume_data";
    try {
      draftKey = userScopedKey("diagnosis_resume_data");
      localStorage.removeItem("diagnosis_resume_data");
      localStorage.removeItem("user_resume");
      localStorage.removeItem(userScopedKey("user_resume"));
    } catch { /* 隐私模式：退回内存态 */ }

    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const text = resumeDataToText(JSON.parse(draft));
      if (text) setResumeText(text);
    } catch {
      /* 草稿损坏：当作没有草稿 */
    }
    localStorage.removeItem(draftKey);
  }, []);

  /* 价格 / 余额 / 每日次数：全部来自蛋蛋世界后端（后台「系统设置」实时决定） */
  const loadMeta = async () => {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(apiBase() + "/api/resume/meta", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (json.code === 200 && json.data) {
        const d = json.data;
        setMeta({
          analyzeCost: Number(d.analyzeCost) || 0,
          listPrice: Number(d.listPrice) || Number(d.analyzeCost) || 50,
          chargeEnabled: d.chargeEnabled !== false,
          dailyLimit: Number(d.dailyLimit) || 0,
          todayUsed: Number(d.todayUsed) || 0,
          todayLeft: typeof d.todayLeft === "number" ? d.todayLeft : undefined,
          balance: Number(d.balance) || 0,
        });
      }
    } catch { /* 未登录或网络异常时按未知处理 */ }
  };

  const loadHistoryRecord = async (id: number) => {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(apiBase() + "/api/resume/analyses/" + id, {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (json.code !== 200) {
        setDialog({ tone: "warn", title: "这条记录打不开", description: json.msg || "请稍后再试。" });
        return;
      }
      setResumeText(json.data.resumeText || "");
      setJdText(json.data.jdText || "");
      setAnalysisResult(json.data.analysis || null);
    } catch {
      setDialog({ tone: "warn", title: "这条记录打不开", description: "网络不太稳，请稍后再试。" });
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  /* 「历史对标」页点任意一条会写 open_analysis_id 再跳回来，这里载入那次记录 */
  useEffect(() => {
    let pending: string | null = null;
    try {
      const key = userScopedKey("open_analysis_id");
      pending = localStorage.getItem(key);
      if (pending) localStorage.removeItem(key);
      localStorage.removeItem("open_analysis_id");
    } catch {}
    if (!pending) return;
    const id = Number(pending);
    if (Number.isFinite(id) && id > 0) loadHistoryRecord(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsExtracting(true);
    try {
      let text = "";
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map((item: any) => item.str).join(" ") + "\n";
        }
      } else if (file.name.endsWith(".docx") || file.type.includes("word")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        throw new Error("目前只支持 PDF 和 Word (.docx) 格式");
      }
      setResumeText(text);
    } catch (error: any) {
      setDialog({
        tone: "warn",
        title: "文件读不出来",
        description: error.message || "换一份文件试试，或者直接把简历文字粘贴到左边。",
      });
    } finally { setIsExtracting(false); }
  };

  const runAnalyze = async (token: string) => {
    setIsAnalyzing(true);
    try {
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const response = await fetch(apiBase() + "/api/resume/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ resumeText, jdText, requestId }),
      });
      /* 蛋蛋世界后端统一返回 { code, msg, data }；
         余额不足 code=402，今天的次数用完 code=429，失败时后端已自动退款 */
      const result = await response.json().catch(() => null);
      if (!result) throw new Error("服务暂时不可用，请稍后重试");
      if (result.code !== 200) throw new Error(result.msg || "对标失败，请稍后重试");

      setAnalysisResult(result.data.analysis);
      refreshAccount();
      /* 余额与「今日剩余次数」以后端为准，重新拉一次 meta */
      loadMeta();
    } catch (error: any) {
      setDialog({
        tone: "warn",
        title: "这次没跑成",
        description: error.message || "对标建议生成中，请稍后重试",
      });
    } finally { setIsAnalyzing(false); }
  };

  /* 每次点按钮都先弹一次：没登录 / 没简历 / 没 JD / 次数用完 / 余额不够，都在弹窗里说清楚 */
  const handleAnalyzeClick = () => {
    const token = authToken();
    const charging = meta?.chargeEnabled !== false;
    const cost = charging ? (meta?.analyzeCost ?? 50) : 0;
    const dailyLimit = meta?.dailyLimit ?? 0;

    if (!token) {
      return setDialog({
        tone: "warn",
        title: "还没登录蛋蛋世界",
        description: "从蛋蛋世界的「学生工坊」进入简历站，才能带上登录态和蛋蛋币。",
      });
    }
    if (!resumeText.trim()) {
      return setDialog({
        tone: "warn",
        title: "先放一份简历",
        description: "上传 PDF / Word，或把简历文字粘贴到左边，再来做对标。",
      });
    }
    if (!jdText.trim()) {
      return setDialog({
        tone: "warn",
        title: "还差目标岗位 JD",
        description: "把岗位职责和要求粘到右边，诊断才有对照物。",
      });
    }
    if (meta && dailyLimit > 0 && (meta.todayLeft ?? 0) <= 0) {
      return setDialog({
        tone: "warn",
        title: "今天的次数用完了",
        description: `每天可以用 ${dailyLimit} 次，今天已经用完，明天再来～`,
      });
    }
    if (charging && meta && meta.balance < cost) {
      return setDialog({
        tone: "warn",
        title: "蛋蛋币不够",
        description: `本次需要 ${cost} 蛋蛋币，当前余额 ${meta.balance}。回蛋蛋世界做任务可以赚币。`,
        bill: { cost, balance: meta.balance },
      });
    }

    setDialog({
      tone: "confirm",
      title: "开始深度对标？",
      description: charging
        ? "AI 会逐条对照 JD 给出问题和改写范例，生成大约需要 10–30 秒；失败会自动退回蛋蛋币。"
        : `当前限时免费，本次不扣蛋蛋币${dailyLimit > 0 ? `；今天还可以用 ${meta?.todayLeft ?? 0} 次` : "，次数不限"}。生成大约需要 10–30 秒。`,
      bill: charging ? { cost, balance: meta?.balance } : undefined,
      confirmText: charging ? `确认扣除 ${cost} 币` : "免费生成",
      onConfirm: () => runAnalyze(token),
    });
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setResumeText("");
    setJdText("");
  };

  const charging = meta?.chargeEnabled !== false;
  const dailyLimit = meta?.dailyLimit ?? 0;
  const quotaText = dailyLimit > 0 ? `今日剩余 ${meta?.todayLeft ?? 0} 次` : "不限次数";
  const outOfBalance = !!meta && charging && meta.balance < meta.analyzeCost;
  const outOfQuota = !!meta && dailyLimit > 0 && (meta.todayLeft ?? 0) <= 0;

  return (
    <div className="flex min-h-screen md:h-screen w-full flex-col md:flex-row md:overflow-hidden bg-[#fafaf9]">
      <Sidebar />

      <main className="flex-1 flex flex-col md:overflow-hidden">
        <header className="px-4 py-4 md:px-10 md:py-6 border-b border-[#e7e5e4] bg-white flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
          <div>
            <h1 className="text-lg md:text-xl font-black text-[#292524]">大师兄简历对标诊断</h1>
            <div className="text-xs text-[#78716c] mt-1 flex items-center gap-2 flex-wrap">
              对比目标岗位要求，给出深度修改建议
              {meta && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  outOfBalance || outOfQuota ? "bg-red-50 text-red-500" : "bg-orange-50 text-[#c2410c]"
                }`}>
                  {charging
                    ? `深度对标 ${meta.analyzeCost} 蛋蛋币/次 · 余额 ${meta.balance}`
                    : "限时免费"}
                  {" · "}{quotaText}
                </span>
              )}
            </div>

          </div>
          {resumeText && (
            <button onClick={handleReset} className="text-[#c2410c] font-black text-[10px] uppercase tracking-wider bg-orange-50 px-5 py-2.5 rounded-2xl hover:bg-[#ea580c] hover:text-white transition-all flex items-center gap-2">
              <RotateCcw size={14} /> 诊断下一份
            </button>
          )}
        </header>

        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* 左侧：简历录入区 */}
          <section className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-[#e7e5e4] bg-white p-5 md:p-8 flex flex-col gap-5 md:gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#292524] uppercase tracking-widest">我的简历原文</h3>
              {resumeText && (
                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold text-[#ea580c] flex items-center gap-1 hover:underline">
                  <FileUp size={14} /> 重新上传
                </button>
              )}
            </div>

            <div className="flex-1 relative group min-h-[240px] md:min-h-0">
              <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} accept=".pdf,.docx" className="hidden" />
              
              {!resumeText && !isExtracting ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-full min-h-[240px] border-2 border-dashed border-[#e7e5e4] rounded-2xl md:rounded-[2.5rem] flex flex-col items-center justify-center gap-6 p-6 md:p-8 text-center hover:border-[#ea580c] hover:bg-orange-50/20 transition-all cursor-pointer"
                >
                  <div className="w-16 h-16 bg-[#f1f1f1] rounded-2xl flex items-center justify-center text-[#a8a29e]">
                    <Upload size={32} />
                  </div>
                  <h4 className="font-black text-[#292524]">上传简历或在此粘贴文字</h4>
                </div>
              ) : (
                <textarea 
                  className="w-full h-full min-h-[240px] outline-none resize-none text-[13px] leading-relaxed text-[#292524] bg-[#fafaf9] p-5 md:p-8 rounded-2xl md:rounded-[2rem] border border-transparent focus:border-orange-100 transition-all"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="在此粘贴简历全文..."
                />
              )}
              
              {isExtracting && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-2xl z-10">
                <Loader2 className="animate-spin text-[#ea580c]" size={32} />
                <p className="text-xs font-bold text-[#ea580c]">正在读取简历...</p>
              </div>}
            </div>
          </section>

          {/* 右侧：JD 录入 & 结果区 */}
          <section className="flex-1 p-5 md:p-8 md:overflow-y-auto bg-[#fafaf9] flex flex-col gap-6 md:gap-8">
            {/* JD 录入 */}
            <div className="bg-white border border-[#e7e5e4] rounded-2xl md:rounded-[2.5rem] p-5 md:p-8 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-[#292524] uppercase tracking-widest flex items-center gap-2">
                  <Target size={16} className="text-[#ea580c]"/> 目标岗位 JD
                </h3>
              </div>
              <textarea 
                className="w-full h-32 p-4 text-xs bg-[#fafaf9] border border-gray-100 rounded-2xl outline-none focus:border-orange-200 transition-all resize-none"
                placeholder="粘贴岗位招聘要求，让诊断更精准..."
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
              <button 
                onClick={handleAnalyzeClick}
                disabled={isAnalyzing}
                className="w-full bg-[#ea580c] text-white py-4 rounded-xl font-black shadow-lg shadow-orange-100 disabled:opacity-30 hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
              >
                {isAnalyzing
                  ? <Loader2 size={18} className="animate-spin" />
                  : <><Sparkles size={18} /> 开始深度对标诊断{meta ? (charging ? ` · ${meta.analyzeCost} 蛋蛋币` : " · 免费") : ""}</>}
              </button>
              {outOfBalance && (
                <p className="text-[11px] font-bold text-red-500 text-center">
                  蛋蛋币不足（需要 {meta?.analyzeCost}，当前 {meta?.balance}），回蛋蛋世界做任务可以赚币
                </p>
              )}
              {outOfQuota && (
                <p className="text-[11px] font-bold text-red-500 text-center">
                  今天的次数已用完（每天 {dailyLimit} 次），明天再来～
                </p>
              )}
            </div>

            {/* 报告区 */}
            {!analysisResult ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 opacity-30 py-20">
                <ShieldCheck size={60} strokeWidth={1} />
                <p className="text-sm font-bold text-black/60">准备好简历和 JD，大师兄为你把关</p>
              </div>
            ) : (
              <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
                {/* 总分卡 */}
                <div className="bg-[#292524] rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 flex items-center justify-between gap-4 text-white shadow-xl">
                  <div className="flex flex-col gap-3 min-w-0">
                    <div className="text-[10px] font-black text-orange-400 uppercase tracking-widest">诊断结论</div>
                    <h2 className="text-base md:text-xl font-bold leading-relaxed">{analysisResult.summary}</h2>
                  </div>
                  <div className="flex flex-col items-center shrink-0 ml-2 md:ml-6">
                    <span className="text-4xl md:text-6xl font-black text-[#ea580c]">{analysisResult.score}</span>
                    <span className="text-[10px] font-bold text-white/40 uppercase">匹配得分</span>
                  </div>
                </div>

                {/* 优化建议卡片 */}
                <div className="flex flex-col gap-6">
                  <h3 className="text-sm font-black text-[#292524] uppercase tracking-widest pl-2 border-l-4 border-[#ea580c]">逐项优化建议</h3>
                  {analysisResult.highlights?.map((item: any, idx: number) => (
                    <div key={idx} className="bg-white border border-[#e7e5e4] rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-sm hover:border-[#ea580c] transition-all">
                      <div className="p-5 md:p-8 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50 text-orange-500"><AlertCircle size={18} /></div>
                          <h4 className="font-bold text-[#292524]">{item.title}</h4>
                        </div>
                        <p className="text-sm text-[#78716c] leading-relaxed md:pl-11">{item.detail}</p>
                      </div>
                      <div className="bg-[#fafaf9] border-t border-[#e7e5e4] p-5 md:p-8 flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-black text-[#a8a29e] uppercase">修改范例</div>
                        <p className="text-xs text-[#a8a29e] italic line-through pl-2">{item.original_context}</p>
                        <div className="bg-[#0d9488]/5 border border-[#0d9488]/10 rounded-2xl p-4 md:p-6 text-[13px] text-[#0d9488] font-medium leading-relaxed">
                          {item.expert_rewrite}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <aside className="hidden lg:flex w-64 bg-white border-l border-[#e7e5e4] p-6 flex-col gap-6 no-print">
        <div className="p-5 bg-[#292524] rounded-2xl text-white flex flex-col gap-3 shadow-xl">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-[#ea580c]"><Trophy size={16} /></div>
          <h4 className="font-bold text-sm">专家精修服务</h4>
          <p className="text-[10px] text-white/50 leading-relaxed">想要 100% 还原面试官标准的简历？大师兄提供人工 1 对 1 精修服务。</p>
          <button onClick={() => setIsQRModalOpen(true)} className="mt-2 w-full bg-[#ea580c] py-2 rounded-lg text-xs font-bold shadow-lg active:scale-95 transition-all">点击了解详情</button>
        </div>
      </aside>

      {/* 微信二维码弹窗 (保持不变) */}
      {isQRModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="dialog-backdrop absolute inset-0 bg-[#292524]/60 backdrop-blur-md" onClick={() => setIsQRModalOpen(false)}></div>
          <div className="dialog-panel relative bg-white w-full max-w-[360px] rounded-[2.5rem] shadow-2xl p-10 flex flex-col items-center gap-6">
            <button onClick={() => setIsQRModalOpen(false)} className="absolute top-6 right-6 text-[#a8a29e] hover:text-[#292524] transition-colors"><X size={24} /></button>
            <div className="text-center">
              <h3 className="text-xl font-black text-[#292524]">添加大师兄微信</h3>
              <p className="text-sm text-[#78716c] mt-2">备注“简历精修” 开启 1 对 1 咨询</p>
            </div>
            <div className="w-full bg-[#fafaf9] rounded-3xl border border-[#e7e5e4] p-4 flex items-center justify-center overflow-hidden">
              <img src="/wechat-qr.png" alt="大师兄微信" className="w-full h-auto max-h-[400px] object-contain rounded-xl" onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<div class="flex flex-col items-center text-gray-400 py-10 gap-2"><div class="p-4 bg-gray-100 rounded-2xl"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/><path d="M12 7v10"/><path d="M7 12h10"/></svg></div><p class="text-[10px] font-bold">请检查图片路径</p></div>';
              }} />
            </div>
            <div className="flex items-center gap-2 text-[#0d9488] bg-[#0d9488]/10 px-4 py-2 rounded-full"><MessageCircle size={16} /><span className="text-xs font-bold">100% 真人专家服务</span></div>
          </div>
        </div>
      )}
      {/* 站内统一弹窗：扣币确认 / 各类提示都走它，不再用浏览器原生 alert */}
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
