import { chromium } from "playwright";

import type { CareerReportSection } from "@career/contracts/types";

import type {
  ReportExporter,
  ReportExportOutput,
  ReportExportRenderInput,
} from "./report.exporter.js";
import { getProfileName } from "../profile/profile.selectors.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSection(section: CareerReportSection): string {
  const paragraphs = section.content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return `
    <section class="report-section">
      <div class="section-badge">${escapeHtml(section.key)}</div>
      <h2>${escapeHtml(section.title)}</h2>
      <div class="section-body">${paragraphs}</div>
    </section>
  `;
}

function buildHtml(input: ReportExportRenderInput): string {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const sections = input.report.sections.map(renderSection).join("");

  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>职业规划报告</title>
      <style>
        @page {
          size: A4;
          margin: 18mm 16mm 18mm 16mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          color: #14213d;
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          background:
            radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 28%),
            radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 24%),
            #f8fafc;
        }

        .page {
          min-height: 100vh;
          padding: 16px 0 24px;
        }

        .cover {
          padding: 32px 28px 28px;
          border-radius: 24px;
          background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #0ea5e9 100%);
          color: #ffffff;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
        }

        .cover-label {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          font-size: 12px;
          letter-spacing: 0.08em;
        }

        .cover h1 {
          margin: 18px 0 10px;
          font-size: 34px;
          line-height: 1.2;
        }

        .cover p {
          margin: 0;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.92);
        }

        .meta-grid {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .meta-card {
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .meta-card strong {
          display: block;
          margin-bottom: 6px;
          font-size: 12px;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.78);
        }

        .meta-card span {
          font-size: 18px;
          font-weight: 700;
        }

        .report-section {
          margin-top: 18px;
          padding: 22px 22px 18px;
          border-radius: 20px;
          background: #ffffff;
          border: 1px solid #dbeafe;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
          page-break-inside: avoid;
        }

        .section-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .report-section h2 {
          margin: 12px 0 12px;
          font-size: 22px;
          color: #0f172a;
        }

        .section-body p {
          margin: 0 0 10px;
          font-size: 14px;
          line-height: 1.8;
          color: #334155;
        }

        .section-body p:last-child {
          margin-bottom: 0;
        }

        .page-footer {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #64748b;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="cover">
          <span class="cover-label">CAREER AGENT REPORT</span>
          <h1>职业规划报告</h1>
          <p>基于当前职业匹配结果生成，用于展示学生能力结构、岗位契合度与行动建议。</p>
          <div class="meta-grid">
            <div class="meta-card">
              <strong>学生姓名</strong>
              <span>${escapeHtml(getProfileName(input.profile))}</span>
            </div>
            <div class="meta-card">
              <strong>目标岗位</strong>
              <span>${escapeHtml(input.job.title)}</span>
            </div>
            <div class="meta-card">
              <strong>报告版本</strong>
              <span>V${input.report.version}</span>
            </div>
            <div class="meta-card">
              <strong>综合匹配分</strong>
              <span>${input.report.total_score} 分</span>
            </div>
          </div>
        </section>

        ${sections}

        <footer class="page-footer">
          <span>报告编号 #${input.report.id}</span>
          <span>导出时间 ${escapeHtml(exportedAt)}</span>
        </footer>
      </main>
    </body>
  </html>
  `;
}

/**
 * 文件作用：使用 Playwright + HTML/CSS 渲染比赛展示风格的 PDF 报告。
 * 设计原因：首版重点保证视觉表达与分页稳定性，便于后续继续演进导出模板。
 */
export function createPlaywrightReportExporter(): ReportExporter {
  return {
    async export(input: ReportExportRenderInput): Promise<ReportExportOutput> {
      const browser = await chromium.launch({ headless: true });

      try {
        const page = await browser.newPage();
        await page.setContent(buildHtml(input), {
          waitUntil: "networkidle",
        });

        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "14mm",
            right: "10mm",
            bottom: "14mm",
            left: "10mm",
          },
        });

        return {
          format: "pdf",
          bytes: Buffer.from(pdf),
          fileExtension: "pdf",
        };
      } finally {
        await browser.close();
      }
    },
  };
}
