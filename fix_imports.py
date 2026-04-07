import re

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "r") as f:
    text = f.read()

# Fix duplicate marked and dompurify
text = re.sub(r'import { marked } from "marked";\nimport DOMPurify from "dompurify";\nimport { marked } from "marked";\nimport DOMPurify from "dompurify";\n', 'import { marked } from "marked";\nimport DOMPurify from "dompurify";\n', text)
# Fix duplicate polishSectionContent
text = re.sub(r'import { polishSectionContent } from "@/shared/api/agent";\nimport { polishSectionContent } from "@/shared/api/agent";\n', 'import { polishSectionContent } from "@/shared/api/agent";\n', text)

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "w") as f:
    f.write(text)
