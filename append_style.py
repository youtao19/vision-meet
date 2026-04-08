with open("apps/frontend/src/features/report/pages/ReportPage.vue", "r") as f:
    text = f.read()

styles = """
/* markdown report continuous reading style */
.sections-container.preview-mode {
  gap: 0;
}

.continuous-report.paper-style {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 40px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.report-section {
  position: relative;
}

.report-section + .report-section::before {
  content: "";
  position: absolute;
  top: -16px;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--border);
}

.section-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  position: relative;
  padding-left: 12px;
}

.preview-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  background-color: var(--primary);
  border-radius: 2px;
}

.markdown-content {
  font-size: 15px;
  line-height: 1.8;
  color: #334155;
  white-space: normal;
}

.markdown-content :deep(p) {
  margin: 0 0 16px;
}
.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul), .markdown-content :deep(ol) {
  margin: 0 0 16px;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin-bottom: 8px;
}

.markdown-content :deep(strong) {
  color: #0f172a;
  font-weight: 600;
}

.markdown-content :deep(a) {
  color: var(--primary);
  text-decoration: none;
}
.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #cbd5e1;
  padding-left: 16px;
  margin: 0 0 16px;
  color: #64748b;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 0 8px 8px 0;
}
"""

if "/* markdown report continuous reading style */" not in text:
    text = text.replace("</style>", styles + "\n</style>")

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "w") as f:
    f.write(text)
