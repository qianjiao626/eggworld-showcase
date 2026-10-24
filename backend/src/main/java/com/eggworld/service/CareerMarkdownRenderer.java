package com.eggworld.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 极简 Markdown → HTML 渲染器，仅供职业测评报告使用。
 * 覆盖 career.md 实际用到的语法：## / ### 标题、- 无序列表、1. 有序列表、**加粗**、普通段落。
 * 不做链接、图片、表格等扩展，避免引入外部依赖。
 */
@Component
public class CareerMarkdownRenderer {

    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");

    public String render(String markdown) {
        if (markdown == null) return "";
        String[] lines = markdown.replace("\r\n", "\n").split("\n");
        StringBuilder html = new StringBuilder();
        String listType = null; // "ul" / "ol" / null
        for (String raw : lines) {
            String line = raw.strip();
            if (line.isEmpty()) { closeList(html, listType); listType = null; continue; }
            if (line.startsWith("### ")) {
                closeList(html, listType); listType = null;
                html.append("<h4>").append(inline(line.substring(4))).append("</h4>");
            } else if (line.startsWith("## ")) {
                closeList(html, listType); listType = null;
                html.append("<h3>").append(inline(line.substring(3))).append("</h3>");
            } else if (line.startsWith("# ")) {
                closeList(html, listType); listType = null;
                html.append("<h2>").append(inline(line.substring(2))).append("</h2>");
            } else if (line.startsWith("- ")) {
                if (!"ul".equals(listType)) { closeList(html, listType); html.append("<ul>"); listType = "ul"; }
                html.append("<li>").append(inline(line.substring(2))).append("</li>");
            } else if (line.matches("^\\d+\\.\\s+.*")) {
                if (!"ol".equals(listType)) { closeList(html, listType); html.append("<ol>"); listType = "ol"; }
                html.append("<li>").append(inline(line.replaceFirst("^\\d+\\.\\s+", ""))).append("</li>");
            } else {
                closeList(html, listType); listType = null;
                html.append("<p>").append(inline(line)).append("</p>");
            }
        }
        closeList(html, listType);
        return html.toString();
    }

    private void closeList(StringBuilder html, String listType) {
        if ("ul".equals(listType)) html.append("</ul>");
        else if ("ol".equals(listType)) html.append("</ol>");
    }

    /** 仅处理 **加粗** 并做 HTML 转义，防止素材里的尖括号破坏结构。 */
    private String inline(String text) {
        String escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        Matcher m = BOLD.matcher(escaped);
        StringBuilder sb = new StringBuilder();
        while (m.find()) m.appendReplacement(sb, "<strong>" + Matcher.quoteReplacement(m.group(1)) + "</strong>");
        m.appendTail(sb);
        return sb.toString();
    }

    public List<String> splitSections(String material) {
        // 素材以 <!-- N --> 分节，第 N 节对应索引 N-1
        List<String> sections = new ArrayList<>();
        String[] parts = material.split("<!-- \\d+ -->");
        // parts[0] 是首个注释前的内容（通常为空），跳过
        for (int i = 1; i < parts.length; i++) sections.add(parts[i].strip());
        return sections;
    }
}
