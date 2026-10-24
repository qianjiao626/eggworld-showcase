/* 「写简历」保存的是结构化草稿（diagnosis_resume_data），
   「改简历」要的是可以直接喂给 AI 的整篇纯文本。
   这里做一次拍平，顺序和简历版式一致：抬头 → 核心能力 → 教育 → 实习 → 项目 → 技能。 */

export type ResumeDraft = {
  basic?: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    target?: string;
  };
  competencies?: string;
  education?: { school?: string; major?: string; period?: string; content?: string }[];
  internships?: { company?: string; role?: string; period?: string; content?: string }[];
  projects?: { name?: string; role?: string; period?: string; content?: string }[];
  skills?: string;
};

/* 「写简历」里没填时留的是这些占位词，拍平的时候要当空值处理 */
const PLACEHOLDERS = new Set(["姓名", "手机号", "邮箱", "城市", "意向岗位"]);

function clean(value?: string): string {
  const text = (value || "").trim();
  return PLACEHOLDERS.has(text) ? "" : text;
}

function line(parts: (string | undefined)[], sep = " ｜ "): string {
  return parts.map(clean).filter(Boolean).join(sep);
}

/* 模板正文里有 **加粗** 这类 Markdown 标记，拍平成纯文本时去掉，避免喂给 AI 的正文夹符号 */
function plain(value?: string): string {
  return (value || "").replace(/\*\*/g, "").trim();
}

function block(title: string, items: string[]): string[] {
  const body = items.filter(Boolean);
  return body.length ? [title, ...body, ""] : [];
}

/** 结构化草稿 → 整篇纯文本；没有内容时返回空串。 */
export function resumeDataToText(draft: ResumeDraft | null | undefined): string {
  if (!draft) return "";

  const basic = draft.basic || {};
  const out: string[] = [];

  const name = clean(basic.name);
  if (name) out.push(name);

  const contact = line([basic.phone, basic.email, basic.location], " | ");
  if (contact) out.push(contact);

  const target = clean(basic.target);
  if (target) out.push(`求职意向：${target}`);
  if (out.length) out.push("");

  out.push(...block("核心能力", [plain(draft.competencies)]));

  out.push(...block("教育经历", (draft.education || []).map((edu) => [
    line([edu.school, edu.major, edu.period]),
    plain(edu.content),
  ].filter(Boolean).join("\n"))));

  out.push(...block("实习经历", (draft.internships || []).map((exp) => [
    line([exp.company, exp.role, exp.period]),
    plain(exp.content),
  ].filter(Boolean).join("\n"))));

  out.push(...block("项目经验", (draft.projects || []).map((proj) => [
    line([proj.name, proj.role, proj.period]),
    plain(proj.content),
  ].filter(Boolean).join("\n"))));

  out.push(...block("技能与工具", [plain(draft.skills)]));

  return out.join("\n").trim();
}
