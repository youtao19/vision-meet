import re

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "r") as f:
    text = f.read()

# 1. Add isAnyPolishing computed property
computed_prop = """
const isAnyPolishing = computed(() => Object.values(loading.polish).some((val) => val));

function formatApiError(error: unknown): string {
"""
text = text.replace("function formatApiError(error: unknown): string {", computed_prop, 1)

# 2. Add handlePolishAll method
polish_all_fn = """
async function handlePolishAll(): Promise<void> {
  const sectionsToPolish = editableSections.value.filter(s => s.content.trim().length > 0);
  if (sectionsToPolish.length === 0) {
    uiState.error = "没有可润色的内容";
    return;
  }
  
  for (const section of sectionsToPolish) {
    // Only continue if not interrupted (bonus: could add a cancel mechanism, but sequential is fine for now)
    await handlePolishSection(section);
  }
  uiState.success = "全文所有章节已顺序润色完成！";
}

async function searchByMatchId(): Promise<void> {
"""
text = text.replace("async function searchByMatchId(): Promise<void> {", polish_all_fn, 1)

# 3. Update individual button disable state
text = text.replace(':disabled="loading.save || loading.polish[section.key]"', ':disabled="loading.save || isAnyPolishing"')

# 4. Add global polish button to the top action header if in edit mode
header_actions_old = """
              <button class="btn btn-outline" :disabled="loading.export" @click="exportCurrentReport">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {{ loading.export ? "生成中..." : "导出 PDF" }}
              </button>
              <button v-if="isEditMode" class="btn btn-primary shadow" :disabled="loading.save" @click="saveCurrentReport">
"""
header_actions_new = """
              <button v-if="isEditMode" class="btn btn-outline text-primary" :disabled="loading.save || isAnyPolishing" @click="handlePolishAll">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                {{ isAnyPolishing ? "全文顺序润色中..." : "一键润色全文" }}
              </button>
              <button class="btn btn-outline" :disabled="loading.export" @click="exportCurrentReport">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {{ loading.export ? "生成中..." : "导出 PDF" }}
              </button>
              <button v-if="isEditMode" class="btn btn-primary shadow" :disabled="loading.save" @click="saveCurrentReport">
"""

text = text.replace(header_actions_old, header_actions_new, 1)

with open("apps/frontend/src/features/report/pages/ReportPage.vue", "w") as f:
    f.write(text)

