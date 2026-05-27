# Docker 最小启动清单

这份清单给第一次接手项目的同学使用。目标是：从 Git clone 代码开始，在 Windows 电脑上用 Docker 启动 Career Agent，并恢复成当前演示环境的数据状态。

## 0. 最终效果

完成后可以访问：

| 地址 | 用途 |
| --- | --- |
| `http://localhost:5173` | 前端系统 |
| `http://localhost:8000/healthz` | 后端健康检查 |
| `http://localhost:7474` | Neo4j Browser |

Neo4j 登录：

```text
username: neo4j
password: career_dev_password
```

会恢复的数据包括：

- 简历数据
- 学生画像
- 匹配结果
- 报告数据
- 路径图谱数据
- 报告导出文件、岗位漫画、岗位有声绘本等后端 storage 文件
- 岗位库数据

## 1. 安装 Docker Desktop

先安装并启动 Docker Desktop。

打开 PowerShell，执行：

```powershell
docker version
docker compose version
```

两个命令都能输出版本信息，才继续下一步。

## 2. 克隆代码

进入自己放项目的目录，例如：

```powershell
cd D:\workspace
git clone <仓库地址> career-agent
cd career-agent
```

把 `<仓库地址>` 换成真实 Git 仓库地址。

后面所有命令都在 `career-agent` 项目根目录执行。

## 3. 确认备份文件存在

项目中必须有这三个文件：

```text
infra\backups\current\postgres.sql
infra\backups\current\neo4j-data.tar.gz
infra\backups\current\backend-storage.zip
```

如果缺少任意一个文件，无法恢复成当前演示环境的数据状态。

## 4. 复制环境变量文件

执行：

```powershell
Copy-Item infra\env\backend.env.example infra\env\backend.env
```

打开配置文件：

```powershell
notepad infra\env\backend.env
```

至少填写 AI 和火山 TTS 配置。

Kimi Coding：

```env
KIMI_API_KEY=你的_key
KIMICODE_API_KEY=你的_key
```

火山 TTS：

```env
VOLCENGINE_TTS_APP_ID=你的_app_id
VOLCENGINE_TTS_ACCESS_TOKEN=你的_access_token
```

不要把 `infra\env\backend.env` 提交到 Git。

## 5. 一键恢复数据并启动系统

执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1
```

这个脚本会自动完成：

1. 检查 Docker 和 Docker Compose。
2. 检查 `infra\docker-compose.app.yml` 配置。
3. 停止已有 Career Agent Docker 服务。
4. 创建 PostgreSQL 和 Neo4j 数据卷。
5. 恢复 Neo4j 路径图谱数据。
6. 启动 PostgreSQL。
7. 清空并恢复 PostgreSQL 数据。
8. 恢复 `apps\backend\storage` 文件。
9. 构建并启动前端、后端、数据库和图数据库。

如果机器已经构建过镜像，只想重新恢复数据并启动，可以执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1 -SkipBuild
```

## 6. 检查是否启动成功

查看服务状态：

```powershell
docker compose -f infra/docker-compose.app.yml ps
```

正常应该看到：

- `postgres` 是 running 或 healthy
- `neo4j` 是 running 或 healthy
- `backend` 是 running 或 healthy
- `frontend` 是 running 或 healthy

检查后端：

```powershell
curl http://localhost:8000/healthz
```

正常会返回：

```json
{"status":"ok","env":"docker","database":"postgres://career@postgres:5432/career_agent"}
```

打开前端：

```text
http://localhost:5173
```

## 7. 检查数据是否恢复成功

查看 PostgreSQL 核心数据数量：

```powershell
docker compose -f infra/docker-compose.app.yml exec postgres psql -U career -d career_agent -c "select 'student_profiles' as table_name, count(*) from student_profiles union all select 'resume_html_records', count(*) from ai_resume_html_records union all select 'match_results', count(*) from match_results union all select 'career_reports', count(*) from career_reports union all select 'path_graph_runs', count(*) from v2_career_path_graph_runs union all select 'jobs', count(*) from jobs order by table_name;"
```

当前备份应看到类似数量：

| 数据 | 数量 |
| --- | ---: |
| `student_profiles` | 11 |
| `resume_html_records` | 14 |
| `match_results` | 11 |
| `career_reports` | 8 |
| `path_graph_runs` | 1 |
| `jobs` | 9958 |

查看 Neo4j 图谱节点数：

```powershell
docker compose -f infra/docker-compose.app.yml exec neo4j cypher-shell -u neo4j -p career_dev_password "MATCH (n) RETURN count(n) AS nodes"
```

当前备份应看到：

```text
51
```

检查后端 storage 文件：

```powershell
Get-ChildItem apps\backend\storage -Recurse -File | Select-Object -First 20
```

能看到报告、绘本或漫画文件，就说明文件型数据也恢复了。

## 8. 日常启动和停止

停止服务但保留数据：

```powershell
docker compose -f infra/docker-compose.app.yml down
```

再次启动：

```powershell
docker compose -f infra/docker-compose.app.yml up -d
```

查看日志：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f
```

修改 `infra\env\backend.env` 后，让配置生效：

```powershell
docker compose -f infra/docker-compose.app.yml up -d --force-recreate backend
```

## 9. 不要执行的命令

不要随便执行：

```powershell
docker compose -f infra/docker-compose.app.yml down -v
docker volume rm infra_pg_data
docker volume rm infra_neo4j_data
```

这些命令会删除或影响数据库数据。只有确认要清空环境时才使用。

## 10. 详细文档

如果遇到端口占用、页面 404、AI 登录失败、env 不生效等问题，看完整文档：

```text
docs\Windows-Docker-部署说明.md
```
