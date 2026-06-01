# AI 追问式简历生成 PRD

## Problem Statement

当前简历生成页要求用户一次性手动填写所有经历字段，再直接调用 Agent 生成 HTML 简历。这个流程对学生不够友好：很多用户不知道项目、实习、竞赛、校园经历应该怎么表达，也不知道哪些细节能支撑简历亮点。用户希望保留基础信息和教育经历的确定性表单填写，但把下方经历内容交给 AI 通过追问逐步收集，再由 AI 整理成文字版简历信息。只有用户确认文字版内容无误后，系统才生成一份经过美化、可预览、可打印的 HTML 简历。

## Solution

在简历生成能力中新增“AI 追问经历 + 文字确认 + HTML 生成”的两阶段流程。

用户先用表单填写基础信息和教育经历。进入经历补充区后，AI 以聊天式追问收集项目、实习、竞赛、校园经历、技能、证书、奖项、作品链接等信息。AI 需要围绕事实追问，不编造经历和量化结果；当信息足够时，系统生成一份文字版简历信息确认稿，展示给用户审阅。用户可以继续要求修改、补充或删除内容；只有用户明确同意后，系统才调用 HTML 简历生成能力，生成美化后的简历并保存历史记录。

生成出的 HTML 简历应保持当前可打印、A4 优先、现代简洁的方向，但视觉质量要提升：结构清晰、层级明确、留白合理、适合学生求职投递和导出 PDF。生成前的文字确认稿是事实边界，HTML 生成阶段只能基于确认稿和表单信息润色排版，不得新增未经确认的内容。

## User Stories

1. As a student, I want to fill in my name, phone, email, target position, and target city with a form, so that critical contact information is accurate and easy to review.
2. As a student, I want to fill in my education experience with a form, so that school, major, degree, period, GPA, courses, and honors remain structured.
3. As a student, I want the experience section to start from AI questions instead of a large empty form, so that I can provide information without knowing resume-writing rules.
4. As a student, I want AI to ask me one or a small number of focused questions at a time, so that I do not feel overwhelmed.
5. As a student, I want AI to support project, internship, competition, and campus experiences, so that common student resume sections are covered.
6. As a student, I want AI to ask about the background of an experience, so that the resume explains why the work mattered.
7. As a student, I want AI to ask what I personally did, so that the generated resume emphasizes my contribution rather than team-level claims.
8. As a student, I want AI to ask about methods, tools, and technologies, so that technical or professional skills are reflected accurately.
9. As a student, I want AI to ask about difficulties and solutions, so that the resume can show problem-solving ability.
10. As a student, I want AI to ask about outcomes and evidence, so that the resume can include credible results.
11. As a student, I want AI to avoid inventing metrics, awards, schools, companies, or technologies, so that my resume stays truthful.
12. As a student, I want AI to tell me when a detail is too vague, so that I can provide stronger information before generation.
13. As a student, I want to add multiple experiences in one conversation, so that I can complete a full resume without switching interfaces repeatedly.
14. As a student, I want to skip a section I do not have, so that the resume does not contain filler content.
15. As a student, I want AI to organize my answers into professional resume language, so that my raw descriptions become suitable for job applications.
16. As a student, I want AI to classify skills instead of listing all keywords together, so that recruiters can scan my abilities quickly.
17. As a student, I want AI to identify possible skills from my experiences and ask for confirmation, so that I do not miss relevant abilities.
18. As a student, I want to provide certificates, awards, and portfolio links through AI prompts, so that supporting materials are captured naturally.
19. As a student, I want the system to show a plain text resume draft before generating HTML, so that I can confirm the content first.
20. As a student, I want the text draft to include all information that will be used for HTML generation, so that there is no hidden content transformation.
21. As a student, I want to approve the text draft explicitly, so that the system generates HTML only after I agree.
22. As a student, I want to reject the text draft and continue revising, so that incorrect or weak content can be improved.
23. As a student, I want to edit or supplement a specific experience after seeing the draft, so that small corrections do not require restarting the whole flow.
24. As a student, I want to remove an experience before final generation, so that irrelevant content does not enter the final resume.
25. As a student, I want validation errors to tell me which required form fields or draft sections are missing, so that I can fix them quickly.
26. As a student, I want the generated HTML resume to look polished, so that it is presentable for real job applications.
27. As a student, I want the generated HTML resume to be printable and exportable as PDF, so that I can send it to employers.
28. As a student, I want the resume to prioritize one page when possible, so that it matches common campus recruitment expectations.
29. As a student, I want the preview to show the generated resume immediately, so that I can inspect the result.
30. As a student, I want historical generated resumes to remain available, so that I can reopen earlier versions.
31. As a student, I want the history item to show enough metadata, so that I can identify the right generated resume later.
32. As a student, I want AI failures or timeouts to be reported clearly, so that I know whether to retry or adjust input.
33. As a student, I want the system not to fake success when AI fails, so that I do not trust an incomplete result.
34. As a student, I want my confirmed text draft to be stored with the generated record, so that the final HTML can be traced back to the approved content.
35. As a student, I want quality suggestions after generation, so that I can see missing experiences, questionable dates, weak links, or target-role mismatch.
36. As a developer, I want the new flow to keep contracts as the shared source of truth, so that frontend and backend do not duplicate API shapes.
37. As a developer, I want the AI questioning capability separated from HTML generation, so that each capability can evolve and be tested independently.
38. As a developer, I want the backend service to own state transitions, so that the frontend cannot bypass confirmation and directly generate from unconfirmed chat data.
39. As a developer, I want the Pi prompt, parser, and generator logic to live inside the corresponding Pi capability, so that AI behavior stays modular.
40. As a developer, I want deterministic validation around AI output, so that invalid draft structures fail instead of entering the resume record.

## Implementation Decisions

- Modify the existing resume generation feature rather than creating a separate product area. The user-facing page remains the resume builder, but its main workflow changes from large manual experience forms to an assisted resume-draft flow.
- Keep basic information and education as deterministic form data. These fields remain required before final HTML generation, with existing validation concepts retained.
- Replace manual experience entry as the primary path with an AI conversation panel for experience collection. The UI should still allow users to review, revise, and remove structured experience items before confirmation.
- Introduce a resume draft concept as the boundary between conversation and final HTML. The draft is plain text or structured text rendered as readable sections for user confirmation.
- Treat the confirmed draft as the source of truth for HTML generation. HTML generation must not introduce new facts beyond the confirmed draft and form fields.
- Add API contracts for the assisted flow before implementation. Contracts should cover starting or updating an interview session, returning the next AI question or draft, confirming a draft, and generating HTML from a confirmed draft.
- Keep the existing HTML resume response and history concepts, but extend records so the approved draft or normalized input used for generation is recoverable.
- Backend service owns business flow and status transitions. Expected statuses include collecting information, draft ready, revision requested, confirmed, generating, generated, and failed.
- Backend route remains responsible only for request validation and protocol conversion. It must call the resume service, which calls repository and Pi capabilities.
- Add a Pi capability for resume interview and draft generation. This capability owns prompts, output parsing, and validation for AI-generated questions and draft content.
- Keep the existing Pi capability for HTML generation, but update its prompt to consume confirmed resume content and produce a more polished HTML layout.
- Continue to fail on Pi timeout, agent error, or invalid output. No local fake success or placeholder resume should be returned.
- Improve quality warnings so they can run against the confirmed draft or normalized resume input, not only the old all-at-once request shape.
- Frontend state should make the confirmation gate explicit: the final generate action is disabled until the latest draft is confirmed.
- The conversation UI should show AI questions, user answers, draft status, and revision actions in one flow. It should avoid requiring mobile-specific validation for this PRD.
- The HTML preview remains iframe-based or equivalent safe preview behavior, with print/export controls outside the generated HTML.
- Existing history list should continue to load prior HTML resumes. For new records, it should also indicate that a confirmed draft was used.
- Styling work should improve the resume output itself, not just the builder page chrome. The generated resume should be suitable for A4 print and PDF export.
- The design should remain utilitarian and scan-friendly, consistent with an operational career tool rather than a marketing landing page.
- Contracts remain the source of truth for shared types. Frontend and backend must import shared types rather than redefining request or response shapes.

## Testing Decisions

- Tests should verify external behavior: API state transitions, validation, generated draft boundaries, and frontend user flow. They should not assert prompt wording or internal helper call order.
- Add backend service tests for the assisted resume flow. Useful cases include creating/updating an interview session, refusing generation before confirmation, accepting confirmation, and preserving confirmed draft content.
- Add parser tests for the AI interview/draft capability. Useful cases include valid draft output, malformed model output, missing required sections, and refusal to accept invented or structurally invalid data.
- Add route/schema tests or equivalent validation coverage for new request contracts. Useful cases include missing required form fields, invalid session identifiers, and unsupported status transitions.
- Add frontend tests for the resume builder flow if the existing test setup supports it. Useful cases include disabled final generation before confirmation, showing the text draft, accepting a draft, and calling generation afterward.
- Preserve `npm run type-check` as the minimum merge gate, because this repo currently treats type-check plus local runnability as the baseline.
- Manual verification should include a happy path from form entry to AI interview, draft confirmation, HTML preview, print/export availability, and history reload.
- Manual verification should include failure paths: Pi timeout, invalid AI draft output, user revises draft after initial generation readiness, and attempting to generate without confirmation.

## Out of Scope

- Uploading an existing resume file and parsing it into this assisted builder flow.
- Full mobile-specific validation or mobile-first layout verification.
- Multi-language resumes.
- Direct DOCX export.
- Job-specific resume tailoring against a selected job portrait.
- Authentication, multi-user ownership, or resume sharing permissions.
- Rebuilding the whole student profile center.
- Replacing the Pi Agent runtime with another model provider.
- Adding fake local AI fallback behavior.

## Further Notes

- The current resume builder already has HTML generation, preview, quality warnings, and history. This PRD should evolve that path rather than duplicating it.
- The main product risk is fact drift between raw chat answers, AI-organized draft, and final HTML。确认稿必须作为明确边界，避免未经审阅的内容进入最终简历。
- The main engineering risk is mixing conversational state with final resume records. Keep the interview/draft lifecycle distinct from the final generated HTML record, while still linking the final record to the confirmed draft used to create it.
- Use the repo's existing Pi Agent architecture and module layering. Prompt, parser, and generator concerns belong inside the relevant Pi capability; persistence and state transitions belong in the resume service.
