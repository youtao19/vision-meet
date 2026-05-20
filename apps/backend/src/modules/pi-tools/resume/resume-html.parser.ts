export function extractHtmlFromAgentText(rawText: string): string | null {
  const htmlBlockMatch = rawText.match(/```html\s*([\s\S]*?)```/i);
  if (htmlBlockMatch?.[1]?.trim()) {
    return htmlBlockMatch[1].trim();
  }

  const doctypeMatch = rawText.match(/<!doctype[\s\S]*<\/html>/i);
  if (doctypeMatch?.[0]?.trim()) {
    return doctypeMatch[0].trim();
  }

  const htmlMatch = rawText.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch?.[0]?.trim()) {
    return htmlMatch[0].trim();
  }

  return null;
}

export function ensurePrintableControls(html: string): string {
  const hasPrintStyle = /@media\s+print/i.test(html);
  const hasAdjust = /-webkit-print-color-adjust\s*:/i.test(html);
  const hasPageRule = /@page\s*\{/i.test(html);

  let nextHtml = html;

  if (!hasPrintStyle || !hasAdjust || !hasPageRule) {
    const printStyle = `\n<style id="resume-print-style">\n@media print {\n  .resume-print-toolbar { display: none !important; }\n}\n@page { margin: 0; }\nbody { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n</style>\n`;
    if (nextHtml.includes("</head>")) {
      nextHtml = nextHtml.replace("</head>", `${printStyle}</head>`);
    } else {
      nextHtml = printStyle + nextHtml;
    }
  }

  return nextHtml;
}
