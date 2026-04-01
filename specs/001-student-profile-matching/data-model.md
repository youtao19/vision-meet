# Data Model: 学生画像与人岗匹配评分

## 1. StudentProfile（学生画像）

### 字段

- `id`: number，主键。
- `source_type`: `manual | resume`，画像来源。
- `source_digest`: string，输入归一化后的摘要哈希，用于复现追踪。
- `name`: string，学生姓名，必填。
- `target_role`: string，目标岗位，必填。
- `education_level`: string | null。
- `major`: string | null。
- `graduation_year`: number | null。
- `skills`: string[]，至少 1 项。
- `certificates`: string[]，可为空。
- `experience`: object，包含实习/项目/竞赛计数。
- `self_assessment`: object，包含沟通/学习/抗压/创新评分（1-5）。
- `dimension_scores`: object，四维画像得分（0-100）。
- `completeness_score`: number（0-100）。
- `competitiveness_score`: number（0-100）。
- `missing_items`: string[]。
- `personal_summary`: string | null。
- `summary`: string，摘要描述。
- `created_at`: string (ISO 8601)。

### 校验规则

- `name`、`target_role` 不能为空字符串。
- `skills` 去重后至少保留 1 个非空技能。
- `graduation_year` 在 `[2000, 2100]`。
- `self_assessment.*` 在 `[1, 5]`。

## 2. JobProfileSnapshot（岗位画像快照）

> 该实体不一定独立存储，可作为匹配时写入 `MatchResult` 的快照字段。

### 字段

- `job_id`: number，岗位 ID。
- `job_profile_version`: number，岗位画像版本。
- `required_dimensions`: object，四维目标要求值（0-100）。
- `skill_weights`: Record<string, number>，技能权重。
- `summary`: string，岗位画像摘要。

### 校验规则

- `job_id >= 1`。
- 四维目标值都在 `[0, 100]`。

## 3. MatchResult（匹配结果）

### 字段

- `id`: number，主键。
- `student_profile_id`: number，关联 `StudentProfile.id`。
- `job_id`: number，关联岗位。
- `job_profile_version`: number，匹配使用的岗位画像版本。
- `scoring_version`: string，评分规则版本。
- `input_fingerprint`: string，输入指纹（学生画像 + 岗位画像关键字段哈希）。
- `from_cache`: boolean，是否命中已存在结果。
- `dimension_scores`: object，四维匹配得分（0-100）。
- `total_score`: number（0-100）。
- `gaps`: `MatchGapItem[]`，差距项。
- `suggestions`: string[]，改进建议。
- `explanations`: `MatchExplanationItem[]`，维度解释详情。
- `created_at`: string (ISO 8601)。

### 唯一性与幂等约束

- 唯一键建议：
  `student_profile_id + job_id + job_profile_version + scoring_version + input_fingerprint`。
- 当相同唯一键已存在且未强制重算时，返回已存在结果并标记 `from_cache=true`。

### 校验规则

- `student_profile_id >= 1`、`job_id >= 1`。
- 四维分数与总分在 `[0, 100]`。
- `gaps` 至少包含 1 条（当总分低于阈值时为强制）。

## 4. MatchGapItem（差距项）

### 字段

- `dimension`: `base_requirements | professional_skills | professional_quality | development_potential`。
- `target_score`: number（0-100）。
- `current_score`: number（0-100）。
- `gap`: number（`target_score - current_score`，可为 0）。
- `evidence`: string[]，用于解释差距的证据条目。

## 5. MatchExplanationItem（匹配解释条目）

### 字段

- `dimension`: 同上。
- `reasoning`: string，维度解释文本。
- `improvement_actions`: string[]，行动建议。

## 6. 关系与读取模型

- 一个 `StudentProfile` 可对应多个 `MatchResult`。
- 一个 `job_id` 可对应多个 `MatchResult`。
- `MatchResult` 详情接口返回完整解释，列表接口返回摘要字段（总分、四维概览、时间）。

## 7. 状态流转

1. 学生提交输入（手动或简历） -> 生成 `StudentProfile`。
2. 学生选择岗位 -> 生成匹配请求。
3. 系统计算 `input_fingerprint` 并检查是否已存在可复用结果。
4. 命中缓存：返回已有 `MatchResult`；未命中：计算并写入新结果。
5. 前端可通过列表与详情接口回看匹配结果，报告模块按 `id` 读取结果。
