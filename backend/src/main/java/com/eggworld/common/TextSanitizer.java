package com.eggworld.common;

/**
 * 用户文本净化（纵深防御）。
 *
 * <p>前端渲染用户内容时已做 HTML 转义（escapeHtml / jsArgAttr），本类是兜底：
 * 所有 JSON 入参里的 String 在进入业务代码前先去掉 "&lt;"，这样即使将来某处前端漏了转义，
 * 内容里也构造不出 HTML 标签。
 *
 * <p>两个刻意的取舍：
 * <ul>
 *   <li>只删 "&lt;"，不删 "&gt;"：标签必须以 "&lt;" 开头，而 "&gt;" 单独出现不构成标签，
 *       保留它可以少影响正常文本（例如 "5 &gt; 3"、"a &lt; b" 只丢一个尖括号）。</li>
 *   <li>只做删除、不做实体转义：如果这里转成 "&amp;lt;"，前端 escapeHtml 会再转一层，
 *       页面上就会显示成 "&amp;lt;" 字面量。</li>
 * </ul>
 */
public final class TextSanitizer {

    private TextSanitizer() {
    }

    /** 去掉可能用于构造标签的 "&lt;"；null / 不含 "&lt;" 时原样返回，避免无谓的对象创建 */
    public static String clean(String text) {
        if (text == null || text.isEmpty() || text.indexOf('<') < 0) {
            return text;
        }
        return text.replace("<", "");
    }
}
