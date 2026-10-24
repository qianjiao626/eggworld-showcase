"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Dialog, { DialogState } from "@/components/Dialog";
import { apiBase, authToken, userScopedKey } from "@/lib/site";
import { RD_TEMPLATES } from "@/lib/rd-templates";
import { OPS_TEMPLATES } from "@/lib/ops-templates";
import { SUPPLY_TEMPLATES } from "@/lib/supply-templates";
import { FUNC_TEMPLATES } from "@/lib/func-templates";
import { 
  Rocket, ChevronRight, RotateCcw, LayoutGrid, Plus, ArrowRight, Loader2, Sparkles,
  Trash2, User, BookOpen, Briefcase, Cpu, Award, RefreshCw, Check, ShieldCheck, AlertCircle
} from "lucide-react";

// 岗位分类定义
const CATEGORIES = [
  { 
    id: "ops", name: "市场 / 销售 / 运营类", 
    sub: [
      { name: "品牌传播岗", direction: "全部" }, { name: "市场营销岗", direction: "全部" },
      { name: "商务BD", direction: "全部" }, { name: "大客户销售", direction: "全部" },
      { name: "用户运营", direction: "全部" }, { name: "产品运营", direction: "全部" },
      { name: "内容运营", direction: "全部" }, { name: "活动运营", direction: "全部" },
      { name: "电商运营", direction: "全部" }, { name: "直播运营", direction: "全部" },
      { name: "数据运营", direction: "全部" }, { name: "商品运营", direction: "全部" },
      { name: "品类运营", direction: "全部" }, { name: "策略运营", direction: "全部" }
    ]
  },
  { 
    id: "rd", name: "产品研发类", 
    sub: [
      { name: "前端开发", direction: "全部" }, { name: "后端开发", direction: "全部" },
      { name: "测试开发", direction: "全部" }, { name: "SRE运维", direction: "全部" },
      { name: "产品经理", direction: "全部" }, { name: "算法工程师", direction: "全部" },
      { name: "数据库开发", direction: "全部" }, { name: "UI设计", direction: "全部" }
    ]
  },
  { 
    id: "supply", name: "采购 / 供应链 / 质量类", 
    sub: [
      { name: "采购岗", direction: "全部" }, 
      { name: "生产计划", direction: "全部" }, 
      { name: "物流管理", direction: "全部" }, 
      { name: "供应商质量", direction: "全部" }
    ]
  },
  { 
    id: "func", name: "职能类", 
    sub: [
      { name: "人力资源岗", direction: "全部" }, 
      { name: "基础行政岗", direction: "全部" }, 
      { name: "财务BP", direction: "全部" }, 
      { name: "财税合规岗", direction: "全部" }
    ]
  },
];

const MOCK_TEMPLATES: any = { ...RD_TEMPLATES, ...OPS_TEMPLATES, ...SUPPLY_TEMPLATES, ...FUNC_TEMPLATES };

// --- 辅助组件：渲染 Markdown 列表 ---
const BulletListRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const hasBullet = trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('·');
        const content = hasBullet ? trimmed.slice(1).trim() : trimmed;
        
        return (
          <div key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#222]">
            <span className="shrink-0 mt-2 w-1 h-1 bg-black rounded-full" />
            <div className="flex-1 text-justify">
               <RichText text={content} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RichText = ({ text }: { text: string }) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => (
        part.startsWith('**') && part.endsWith('**') 
          ? <strong key={i} className="font-bold text-black">{part.slice(2, -2)}</strong> 
          : part
      ))}
    </>
  );
};

// --- 主页面 ---
export default function ResumeCreatePage() {
  /* 站内跳转一律走 Next 路由：它会自动补上 /rs 前缀。
     直接改 location.href 跳到站内路径会丢掉前缀，线上和本地都会 404。 */
  const router = useRouter();
  const [step, setStep] = useState(1); 
  const [selectedIndustry, setSelectedIndustry] = useState("internet");
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);

  /* 历史草稿：生成过的简历都存一份在后端，换设备也能接着改 */
  async function loadDrafts() {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(apiBase() + "/api/resume/drafts", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (json.code === 200) setDrafts(Array.isArray(json.data) ? json.data : []);
    } catch { /* 草稿列表失败不影响生成流程 */ }
  }

  async function saveDraft(data: any) {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(apiBase() + "/api/resume/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          title: `${data?.basic?.name || "未命名"} · ${data?.basic?.target || "简历"}`,
          target: data?.basic?.target || "",
          data,
        }),
      });
      const json = await res.json();
      if (json.code === 200) loadDrafts();
    } catch { /* 存草稿失败不挡主流程 */ }
  }

  async function openDraft(id: number) {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(apiBase() + "/api/resume/drafts/" + id, {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (json.code !== 200) {
        setDialog({ tone: "warn", title: "这份简历打不开", description: json.msg || "请稍后再试。" });
        return;
      }
      const d = json.data.data || {};
      setResumeData({
        basic: d.basic || { name: "姓名", phone: "手机号", email: "邮箱", location: "城市", target: "意向岗位" },
        competencies: d.competencies || "",
        education: d.education || [],
        internships: d.internships || [],
        projects: d.projects || [],
        skills: d.skills || "",
      });
      setVisibleSections({
        competencies: !!d.competencies,
        education: !!(d.education && d.education.length),
        internships: !!(d.internships && d.internships.length),
        projects: !!(d.projects && d.projects.length),
        skills: !!d.skills,
      });
      setStep(4);
    } catch {
      setDialog({ tone: "warn", title: "这份简历打不开", description: "网络不太稳，请稍后再试。" });
    }
  }

  useEffect(() => { loadDrafts(); }, []);

  // 模块化状态
  const [resumeData, setResumeData] = useState<any>({
    basic: { name: "姓名", phone: "手机号", email: "邮箱", location: "城市", target: "意向岗位" },
    competencies: "",
    education: [],
    internships: [],
    projects: [],
    skills: ""
  });

  // 控制模块显示隐藏的状态
  const [visibleSections, setVisibleSections] = useState({
    competencies: true,
    education: true,
    internships: true,
    projects: true,
    skills: true
  });

  const applyTemplate = (temp: any) => {
    setIsGenerating(true);
    setTimeout(() => {
      const d = temp.data;
      const next = {
        basic: {
          name: d.basicInfo?.name || "林泽言",
          phone: d.basicInfo?.phone || "",
          email: d.basicInfo?.email || "",
          location: d.basicInfo?.location || "",
          target: d.basicInfo?.target || ""
        },
        competencies: d.competencies || "",
        education: d.education || [],
        internships: d.internships || [],
        projects: d.projects || [],
        skills: d.skills || ""
      };
      setResumeData(next);
      setVisibleSections({
        competencies: !!d.competencies,
        education: !!(d.education && d.education.length > 0),
        internships: !!(d.internships && d.internships.length > 0),
        projects: !!(d.projects && d.projects.length > 0),
        skills: !!d.skills
      });
      /* 生成即留档：之后的「之前的简历」列表里能直接接着改 */
      saveDraft(next);
      setIsGenerating(false);
      setStep(4);
    }, 600);
  };

  const updateArrayField = (type: 'education'|'internships'|'projects', index: number, field: string, value: string) => {
    const newList = [...resumeData[type]];
    newList[index] = { ...newList[index], [field]: value };
    setResumeData({ ...resumeData, [type]: newList });
  };

  return (
    <div className="flex min-h-screen md:h-screen w-full flex-col md:flex-row md:overflow-hidden bg-[#fafaf9] print-root">
      {/* 打印专用全局样式 - 极致解锁方案 */}
      <style jsx global>{`
        @media print {
          /* 1. 彻底打破所有高度锁死 */
          html, body, .print-root, main, .print-container {
            height: auto !important;
            overflow: visible !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important; /* 强制转为流式布局 */
          }
          
          /* 2. 隐藏一切不该出现的东西 */
          .no-print {
            display: none !important;
          }

          /* 3. 让简历画布撑开全场 */
          .print-container {
            width: 100% !important;
            background: white !important;
          }

          #resume-canvas {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 20mm 25mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
          }

          /* 4. 优化分页点 */
          h3, header { page-break-after: avoid; }
          .mb-10 { margin-bottom: 25px !important; }
        }
      `}</style>

      <div className="no-print w-full md:w-auto">
        <Sidebar />
      </div>
      
      <main className="flex-1 flex flex-col md:overflow-hidden relative">
        <div className="h-1 bg-[#ea580c] w-full transition-all duration-500 no-print" style={{ width: `${step * 25}%` }} />

        {step < 4 && (
          <div className="flex-1 flex flex-col items-center justify-start px-4 py-8 md:p-10 md:py-20 md:overflow-y-auto no-print">
            {step === 1 && (
              <div className="flex flex-col items-center gap-12 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
                <div className="w-full flex items-center justify-between px-4">
                  <div className="hidden md:block w-24" />
                  <h2 className="text-xl md:text-3xl font-black">请选择岗位大类</h2>
                  <div className="hidden md:block w-24" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 w-full">
                  {CATEGORIES.map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => { setSelectedCategory(cat); setStep(2); }} 
                      className="bg-white border-2 border-[#e7e5e4] p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] flex flex-col items-start gap-4 hover:border-black hover:shadow-2xl transition-all group text-left"
                    >
                      <div className="w-12 h-12 bg-[#fafaf9] rounded-2xl flex items-center justify-center text-[#a8a29e] group-hover:text-black group-hover:bg-orange-50 transition-all">
                        {cat.id === 'ops' ? <Rocket size={24}/> : cat.id === 'rd' ? <Cpu size={24}/> : cat.id === 'supply' ? <ShieldCheck size={24}/> : <User size={24}/>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-lg md:text-xl font-black">{cat.name}</span>
                        <span className="text-xs text-[#a8a29e] font-medium">包含 {cat.sub.length} 个核心方向</span>
                      </div>
                      <ChevronRight className="ml-auto text-[#e7e5e4] group-hover:text-black transition-all" />
                    </button>
                  ))}
                </div>

                {/* 之前的简历：生成过就留档在后端，点开直接回到编辑/预览 */}
                {drafts.length > 0 && (
                  <div className="w-full max-w-2xl flex flex-col gap-2">
                    <p className="text-[11px] font-black text-[#a8a29e] tracking-widest px-1">之前的简历</p>
                    {drafts.slice(0, 3).map((d: any) => (
                      <button
                        key={d.id}
                        onClick={() => openDraft(d.id)}
                        className="flex items-center justify-between gap-3 bg-white border border-[#e7e5e4] rounded-2xl px-4 py-3 text-left hover:border-black transition-all"
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-[#292524] truncate">{d.title}</span>
                          <span className="block text-[11px] text-[#a8a29e]">{d.updatedAt} · {d.target || "未填岗位"}</span>
                        </span>
                        <ChevronRight size={16} className="text-[#a8a29e] shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col items-center gap-10 w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4">
                <div className="w-full flex flex-wrap items-center justify-between gap-3 px-0 md:px-4">
                  <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm font-bold text-[#a8a29e] hover:text-black transition-colors">
                    <ChevronRight className="rotate-180" size={18} /> 返回大类
                  </button>
                  <h2 className="text-xl md:text-3xl font-black">请选择具体方向</h2>
                  <div className="hidden md:block w-24" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 w-full">
                  {selectedCategory.sub.map((sub: any) => {
                    const isHighBar = selectedCategory.id === 'rd' && ["产品经理", "后端开发", "数据库开发", "算法工程师"].includes(sub.name);
                    return (
                      <button key={sub.name} onClick={() => { setSelectedSubCategory(sub.name); setStep(3); }} className="bg-white border-2 border-[#e7e5e4] p-4 md:p-8 rounded-2xl md:rounded-3xl min-h-[132px] md:h-44 text-left hover:border-black transition-all flex flex-col justify-between gap-3 shadow-sm hover:shadow-lg group">
                        <div className="flex flex-col gap-2">
                          <h3 className="text-base md:text-lg font-black">{sub.name}</h3>
                          {isHighBar && (
                            <div className="text-[10px] font-bold text-[#ea580c]/60 flex items-center gap-1">
                              <AlertCircle size={10} /> 对院校档次有一定要求
                            </div>
                          )}
                        </div>
                        <div className="text-[9px] md:text-[10px] font-black uppercase text-[#ea580c] tracking-wider md:tracking-widest bg-orange-50 px-2 md:px-3 py-1 self-start rounded-full whitespace-nowrap group-hover:bg-orange-100 transition-all">100% Original</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center gap-10 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4">
                <div className="w-full flex flex-wrap items-center justify-between gap-3 px-0 md:px-4">
                  <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm font-bold text-[#a8a29e] hover:text-black transition-colors">
                    <ChevronRight className="rotate-180" size={18} /> 返回方向选择
                  </button>
                  <h2 className="text-xl md:text-3xl font-black text-center">匹配完整原版模板</h2>
                  <div className="hidden md:block w-24" />
                </div>
                {(MOCK_TEMPLATES[`${selectedIndustry}-${selectedCategory.id}-${selectedSubCategory}`] || []).map((temp: any) => (
                  <div key={temp.id} className="bg-white border-4 border-black p-6 md:p-12 rounded-3xl md:rounded-[3.5rem] flex flex-col gap-5 md:gap-8 shadow-2xl w-full">
                    <h3 className="text-xl md:text-3xl font-black">{temp.name}</h3>
                    <p className="text-sm md:text-lg text-[#78716c] italic leading-relaxed">已准备好 100% 全量内容，点击预览。</p>
                    <button onClick={() => applyTemplate(temp)} className="bg-black text-white py-4 md:py-6 rounded-2xl font-black text-base md:text-xl hover:bg-[#ea580c] transition-all">立即进入预览</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
            {/* 左侧：结构化模块编辑器 */}
            <section className="w-full md:w-[450px] border-b md:border-b-0 md:border-r border-[#e7e5e4] bg-white flex flex-col h-auto md:h-full md:overflow-y-auto no-print">
               <div className="p-4 md:p-8 border-b border-[#fafaf9] flex justify-between items-center bg-white sticky top-0 z-10">
                 <h3 className="font-black text-xl text-[#292524]">模块化编辑器</h3>
                 <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[10px] font-bold text-[#ea580c] hover:text-black"><RefreshCw size={12}/> 重新选范文</button>
               </div>

               <div className="p-4 md:p-6 flex flex-col gap-6">
                 {/* 模块复原快捷工具栏 */}
                 <div className="flex flex-wrap gap-2 mb-2">
                    {Object.entries(visibleSections).map(([key, visible]) => !visible && (
                      <button key={key} onClick={() => setVisibleSections({...visibleSections, [key]: true})} className="px-3 py-1 bg-orange-50 text-[#ea580c] text-[10px] font-bold rounded-full border border-orange-100 hover:bg-orange-100 flex items-center gap-1">
                        <Plus size={10}/> 找回{key === 'competencies' ? '核心能力' : key === 'education' ? '教育背景' : key === 'internships' ? '实习经历' : key === 'projects' ? '项目经验' : '技能与工具'}
                      </button>
                    ))}
                 </div>

                 {/* 1. 基本信息 */}
                 <div className="bg-[#fafaf9] border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
                   <div className="flex items-center gap-2 mb-2"><User size={16} className="text-[#ea580c]"/><span className="font-black text-sm uppercase">基本信息</span></div>
                   <input className="w-full bg-white border border-gray-200 p-3 rounded-xl text-sm" value={resumeData.basic.name} onChange={e => setResumeData({...resumeData, basic: {...resumeData.basic, name: e.target.value}})} placeholder="姓名" />
                   <div className="grid grid-cols-2 gap-3">
                     <input className="w-full bg-white border border-gray-200 p-3 rounded-xl text-sm" value={resumeData.basic.phone} onChange={e => setResumeData({...resumeData, basic: {...resumeData.basic, phone: e.target.value}})} placeholder="手机号" />
                     <input className="w-full bg-white border border-gray-200 p-3 rounded-xl text-sm" value={resumeData.basic.email} onChange={e => setResumeData({...resumeData, basic: {...resumeData.basic, email: e.target.value}})} placeholder="邮箱" />
                   </div>
                   <input className="w-full bg-white border border-gray-200 p-3 rounded-xl text-sm" value={resumeData.basic.location} onChange={e => setResumeData({...resumeData, basic: {...resumeData.basic, location: e.target.value}})} placeholder="居住地" />
                   <input className="w-full bg-white border border-gray-200 p-3 rounded-xl text-sm font-bold text-[#ea580c]" value={resumeData.basic.target} onChange={e => setResumeData({...resumeData, basic: {...resumeData.basic, target: e.target.value}})} placeholder="意向岗位" />
                 </div>

                 {/* 2. 核心能力 */}
                 {visibleSections.competencies && (
                   <div className="bg-[#fafaf9] border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 relative group">
                     <button onClick={() => setVisibleSections({...visibleSections, competencies: false})} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                     <div className="flex items-center gap-2 mb-2"><Sparkles size={16} className="text-[#ea580c]"/><span className="font-black text-sm uppercase">核心能力</span></div>
                     <textarea className="w-full h-40 bg-white border border-gray-200 p-4 rounded-xl text-xs leading-relaxed" value={resumeData.competencies} onChange={e => setResumeData({...resumeData, competencies: e.target.value})} placeholder="请输入核心能力描述..." />
                   </div>
                 )}

                 {/* 3. 教育背景 */}
                 <div className="bg-[#fafaf9] border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
                   <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2"><BookOpen size={16} className="text-[#ea580c]"/><span className="font-black text-sm uppercase">教育背景</span></div>
                     <button onClick={() => { const newList = [...resumeData.education, { school: '', major: '', period: '', content: '' }]; setResumeData({...resumeData, education: newList}); }} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-black hover:text-white transition-all"><Plus size={14}/></button>
                   </div>
                   {resumeData.education.map((edu: any, idx: number) => (
                     <div key={idx} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3 relative group/item">
                       <button onClick={() => { const newList = resumeData.education.filter((_: any, i: number) => i !== idx); setResumeData({...resumeData, education: newList}); }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all shadow-sm"><Trash2 size={12}/></button>
                       <div className="grid grid-cols-2 gap-2">
                         <input className="font-bold text-xs p-2 border-b border-gray-100" value={edu.school} onChange={e => updateArrayField('education', idx, 'school', e.target.value)} placeholder="学校名称" />
                         <input className="font-bold text-xs p-2 border-b border-gray-100" value={edu.major} onChange={e => updateArrayField('education', idx, 'major', e.target.value)} placeholder="学历/专业" />
                       </div>
                       <input className="text-[10px] p-2 bg-gray-50 rounded" value={edu.period} onChange={e => updateArrayField('education', idx, 'period', e.target.value)} placeholder="时间段" />
                       <textarea className="w-full h-20 p-2 text-[11px] leading-relaxed border-none resize-none focus:ring-0" value={edu.content} onChange={e => updateArrayField('education', idx, 'content', e.target.value)} placeholder="主修课程/奖励..." />
                     </div>
                   ))}
                 </div>

                 {/* 4 & 5. 实习与项目 */}
                 {[
                   { id: 'internships', name: '实习经历', icon: Briefcase, fields: ['company', 'role', 'period'] },
                   { id: 'projects', name: '项目经验', icon: Cpu, fields: ['name', 'role', 'period'] }
                 ].map(m => (
                   <div key={m.id} className="bg-[#fafaf9] border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
                     <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2"><m.icon size={16} className="text-[#ea580c]"/><span className="font-black text-sm uppercase">{m.name}</span></div>
                       <button onClick={() => { const newList = [...resumeData[m.id], { [m.fields[0]]: '', [m.fields[1]]: '', [m.fields[2]]: '', content: '' }]; setResumeData({...resumeData, [m.id]: newList}); }} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-black hover:text-white transition-all"><Plus size={14}/></button>
                     </div>
                     {resumeData[m.id].map((item: any, idx: number) => (
                       <div key={idx} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3 relative group/item">
                         <button onClick={() => { const newList = resumeData[m.id].filter((_: any, i: number) => i !== idx); setResumeData({...resumeData, [m.id]: newList}); }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all shadow-sm"><Trash2 size={12}/></button>
                         <div className="grid grid-cols-2 gap-2">
                           <input className="font-bold text-xs p-2 border-b border-gray-100" value={item[m.fields[0]]} onChange={e => updateArrayField(m.id as any, idx, m.fields[0], e.target.value)} placeholder="名称" />
                           <input className="font-bold text-xs p-2 border-b border-gray-100" value={item[m.fields[1]]} onChange={e => updateArrayField(m.id as any, idx, m.fields[1], e.target.value)} placeholder="职位/角色" />
                         </div>
                         <input className="text-[10px] p-2 bg-gray-50 rounded" value={item[m.fields[2]]} onChange={e => updateArrayField(m.id as any, idx, m.fields[2], e.target.value)} placeholder="时间段" />
                         <textarea className="w-full h-32 p-2 text-[11px] leading-relaxed border-none resize-none focus:ring-0" value={item.content} onChange={e => updateArrayField(m.id as any, idx, 'content', e.target.value)} placeholder="描述内容..." />
                       </div>
                     ))}
                   </div>
                 ))}

                 {/* 6. 技能与工具 */}
                 {visibleSections.skills && (
                   <div className="bg-[#fafaf9] border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 relative group">
                     <button onClick={() => setVisibleSections({...visibleSections, skills: false})} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                     <div className="flex items-center gap-2 mb-2"><Award size={16} className="text-[#ea580c]"/><span className="font-black text-sm uppercase">技能与工具</span></div>
                     <textarea className="w-full h-40 bg-white border border-gray-200 p-4 rounded-xl text-xs leading-relaxed" value={resumeData.skills} onChange={e => setResumeData({...resumeData, skills: e.target.value})} placeholder="请输入技能工具清单..." />
                   </div>
                 )}
               </div>

               <div className="p-4 md:p-8 md:sticky md:bottom-0 bg-white border-t border-[#e7e5e4] z-20 no-print flex flex-col gap-3 md:gap-4">
                 <button 
                   onClick={() => {
                     localStorage.setItem(userScopedKey("diagnosis_resume_data"), JSON.stringify(resumeData));
                     router.push("/resume");
                   }} 
                   className="w-full bg-[#292524] text-white py-3.5 md:py-4 rounded-2xl font-black shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2"
                 >
                   <Sparkles size={18} className="text-[#ea580c]" /> 帮我深度评审和修改这份简历
                 </button>
                 <button onClick={() => window.print()} className="w-full bg-[#ea580c] text-white py-4 md:py-5 rounded-2xl font-black shadow-2xl hover:scale-[1.02] transition-all">导出 PDF</button>
               </div>
            </section>

            {/* 右侧：像素级预览区 */}
            <section className="flex-1 bg-[#292524] flex items-start justify-center p-4 md:p-12 overflow-auto scrollbar-hide print-container">
              <div id="resume-canvas" className="resume-canvas-fit w-[595px] min-h-[842px] bg-white shadow-2xl px-[65px] py-[70px] text-black font-serif relative">
                
                {/* 1寸照片占位 */}
                <div className="absolute top-[75px] right-[65px] w-24 h-32 border-2 border-dashed border-gray-200 rounded flex flex-col items-center justify-center text-[10px] text-gray-300 pointer-events-none">
                   <span>1寸照片</span>
                   <span>(35mm x 45px)</span>
                </div>

                <header className="flex flex-col items-start gap-3 mb-10 mr-28">
                  <h2 className="text-3xl font-bold tracking-[0.2em]">{resumeData.basic.name}</h2>
                  <div className="flex items-center gap-3 text-[12px] text-[#333]">
                    <span>{resumeData.basic.phone}</span><span>/</span>
                    <span>{resumeData.basic.email}</span><span>/</span>
                    <span>{resumeData.basic.location}</span>
                  </div>
                  <div className="text-[12px] font-bold border-b-2 border-black pb-0.5">求职意向：{resumeData.basic.target}</div>
                </header>

                {visibleSections.competencies && resumeData.competencies && (
                  <div className="mb-10 flex flex-col gap-4">
                    <h3 className="text-[15px] font-bold border-b border-black pb-1 uppercase tracking-wider">核心能力</h3>
                    <BulletListRenderer text={resumeData.competencies} />
                  </div>
                )}

                {resumeData.education.length > 0 && (
                  <div className="mb-10 flex flex-col gap-4">
                    <h3 className="text-[15px] font-bold border-b border-black pb-1 uppercase tracking-wider">教育背景</h3>
                    {resumeData.education.map((edu: any, i: number) => (
                      <div key={i} className="flex flex-col gap-2 px-1">
                        <div className="flex justify-between items-baseline font-bold text-[13px]">
                          <span>{edu.school} ｜ {edu.major}</span>
                          <span className="text-[12px] tabular-nums">{edu.period}</span>
                        </div>
                        <div className="text-[12px] text-[#444] leading-relaxed"><RichText text={edu.content} /></div>
                      </div>
                    ))}
                  </div>
                )}

                {resumeData.internships.length > 0 && (
                  <div className="mb-10 flex flex-col gap-6">
                    <h3 className="text-[15px] font-bold border-b border-black pb-1 uppercase tracking-wider">实习经历</h3>
                    {resumeData.internships.map((exp: any, i: number) => (
                      <div key={i} className="flex flex-col gap-2.5 px-1">
                        <div className="flex justify-between items-baseline font-bold text-[13px]">
                          <span>{exp.company} ｜ {exp.role}</span>
                          <span className="text-[12px] tabular-nums">{exp.period}</span>
                        </div>
                        <BulletListRenderer text={exp.content} />
                      </div>
                    ))}
                  </div>
                )}

                {resumeData.projects.length > 0 && (
                  <div className="mb-10 flex flex-col gap-6">
                    <h3 className="text-[15px] font-bold border-b border-black pb-1 uppercase tracking-wider">项目经验</h3>
                    {resumeData.projects.map((p: any, i: number) => (
                      <div key={i} className="flex flex-col gap-2.5 px-1">
                        <div className="flex justify-between items-baseline font-bold text-[13px]">
                          <span>{p.name} ｜ {p.role}</span>
                          <span className="text-[12px] tabular-nums">{p.period}</span>
                        </div>
                        <BulletListRenderer text={p.content} />
                      </div>
                    ))}
                  </div>
                )}

                {visibleSections.skills && resumeData.skills && (
                  <div className="mb-10 flex flex-col gap-4">
                    <h3 className="text-[15px] font-bold border-b border-black pb-1 uppercase tracking-wider">技能与工具</h3>
                    <BulletListRenderer text={resumeData.skills} />
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* 站内统一弹窗，替代浏览器原生 alert */}
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
