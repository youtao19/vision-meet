# Docker 演示数据备份

本目录保存当前 Docker 演示环境的数据备份，配合 `scripts/restore-docker-databases.ps1` 使用。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `postgres.sql` | PostgreSQL 备份，包含简历、学生画像、报告、匹配结果、岗位数据等结构化数据 |
| `neo4j-data.tar.gz` | Neo4j 数据卷备份，包含路径图谱数据 |
| `backend-storage.zip` | 后端文件存储备份，包含报告导出文件、岗位漫画、岗位有声绘本等 |

## 当前备份信息

备份时间：2026-05-27 21:29 Asia/Shanghai

数据量：

| 数据 | 数量 |
| --- | ---: |
| `student_profiles` | 11 |
| `ai_resume_html_records` | 14 |
| `match_results` | 11 |
| `career_reports` | 8 |
| `v2_career_path_graph_runs` | 1 |
| `jobs` | 9958 |
| Neo4j nodes | 51 |

文件校验：

```text
d32b34bc0af05701c835c92e54b4508d8b9df198797a7d1ca1852be3fee38dd9  postgres.sql
92209c0b4c1905ad1e204e275c10ea5137058025984da95465b070cbafeffebc  neo4j-data.tar.gz
d42c51527c10766bc0fced5a572c20db3459d485c22ac387b0d7f0c6bc41488a  backend-storage.zip
```

## 队友导入命令

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1
```

如果镜像已经构建过，只想恢复数据并启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1 -SkipBuild
```

导入脚本会清空目标环境现有 PostgreSQL public schema、Neo4j volume 和 `apps/backend/storage`，再导入本目录中的备份。
