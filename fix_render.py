with open("apps/frontend/src/features/report/pages/ReportPage.vue", "r") as f:
    text = f.read()

correct = """
function renderMarkdown(content: string): string {
  if (!content) return "<p>暂无内容</p>";
  return DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }) as string);
}

function formatSectionContent(content: string): string[] {
  const lines = content
"""

text = text.replace("""function formatSectionContent(content: string): string[] {
function renderMarkdown(content: string): string {
  if (!content) return "<p>暂无内容</p>";
  return DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }) as string);
}
  const lines = content""", correct)

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "w") as f:
    f.write(text)
