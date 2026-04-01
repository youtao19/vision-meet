# Quickstart: 学生画像与人岗匹配评分

## 1. 执行顺序（必须遵守）

1. 先更新契约：
   - `packages/contracts/openapi/career-agent.openapi.yaml`
   - `packages/contracts/types/index.ts`
2. 再实现后端：
   - `apps/backend/src/modules/profile`（新增简历上传入口）
   - `apps/backend/src/modules/matching`（新增匹配领域）
3. 最后实现前端：
   - `apps/frontend/src/features/matching`
   - `apps/frontend/src/shared/api/matching.ts`

## 2. 本地启动

```bash
npm install
npm run dev
```

默认地址：

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`

## 3. 合同验证（手工 smoke）

### 3.1 手动创建学生画像

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "target_role": "前端开发工程师",
    "skills": ["TypeScript", "Vue"],
    "experience": { "project_count": 2 }
  }'
```

### 3.2 简历上传创建学生画像

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/profile/resume" \
  -F "file=@./data/sample-resume.txt" \
  -F "target_role=前端开发工程师"
```

### 3.3 创建匹配结果

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/matches" \
  -H "Content-Type: application/json" \
  -d '{
    "student_profile_id": 1,
    "job_id": 1001,
    "force_recalculate": false
  }'
```

### 3.4 查询匹配结果列表

```bash
curl "http://127.0.0.1:8000/api/v1/matches?student_profile_id=1&offset=0&limit=20"
```

### 3.5 查询匹配结果详情

```bash
curl "http://127.0.0.1:8000/api/v1/matches/1"
```

## 4. 质量门禁

```bash
npm run type-check
```

通过标准：

- 前后端与 contracts 的 TypeScript 检查全部通过。
- 新增接口具备明确请求/响应/错误结构。
- 相同输入重复匹配时，结果保持一致（可复现）。

## 5. 交付前自查

- 是否严格遵循 `route -> service -> repository` 调用链。
- `service` 是否完全通过 repository 抽象访问数据。
- 前端业务逻辑是否仅在 `features` 层实现，`shared/api` 仅负责调用。
- 若实现阶段新增环境变量，是否同步更新两个 `.env.example`。

## 6. 手工 Smoke 记录（2026-04-02）

在受限环境下通过临时端口与临时存储文件执行了端到端 smoke，关键结果如下：

```json
{
  "health": { "code": 200, "status": "ok" },
  "import": { "code": 200, "imported": 1, "skipped": 0 },
  "profile": { "code": 201, "id": 1, "source_type": "manual" },
  "match_create": { "code": 201, "id": 1, "total_score": 90, "from_cache": false },
  "match_repeat": { "code": 201, "id": 1, "total_score": 90, "from_cache": true },
  "list": { "code": 200, "total": 1 },
  "detail": { "code": 200, "id": 1, "suggestions": 4 }
}
```

结论：

- 匹配创建、列表、详情链路可用；
- 同输入重复请求命中缓存，`from_cache` 语义正确；
- 返回结构满足“请求/响应/错误可区分”的契约要求。
