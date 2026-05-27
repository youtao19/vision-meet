# Windows Docker 部署说明

本文用于把 Career Agent 的前端、后端、PostgreSQL、Neo4j、初始化任务、报告文件存储都放到 Docker 中运行。新人只需要安装 Docker Desktop、准备配置文件、执行本文命令，就可以在 Windows 电脑上启动系统。

## 一、部署后会启动哪些服务

当前使用的 Compose 文件是：

```powershell
infra\docker-compose.app.yml
```

它会启动 5 个服务：

| 服务名 | 作用 | 容器内端口 | 本机访问 |
| --- | --- | --- | --- |
| `postgres` | PostgreSQL + pgvector，保存简历、学生画像、报告、匹配结果等结构化数据 | `5432` | `localhost:5433` |
| `neo4j` | 路径图谱数据库 | `7474`、`7687` | `localhost:7474`、`localhost:7687` |
| `init` | 一次性初始化任务，建表、导入岗位数据、写入岗位画像、索引知识库 | 不对外暴露 | 不需要访问 |
| `backend` | Node.js + Express 后端 API | `8000` | `localhost:8000` |
| `frontend` | Nginx 托管前端静态页面，并反向代理后端 API | `80` | `localhost:5173` |

启动成功后常用地址：

| 地址 | 用途 |
| --- | --- |
| `http://localhost:5173` | 前端系统 |
| `http://localhost:8000/healthz` | 后端健康检查 |
| `http://localhost:7474` | Neo4j Browser |

Neo4j 登录信息：

```text
username: neo4j
password: career_dev_password
```

## 二、第一次部署前的准备

### 1. 安装 Docker Desktop

Windows 电脑先安装 Docker Desktop，并启动 Docker Desktop。

安装后打开 PowerShell，执行：

```powershell
docker version
docker compose version
```

这两个命令能正常输出版本号，说明 Docker 可用。

命令说明：

| 命令 | 功能 |
| --- | --- |
| `docker version` | 查看 Docker 客户端和服务端版本，用来确认 Docker Desktop 已启动 |
| `docker compose version` | 查看 Docker Compose 版本，用来确认可以执行 Compose 编排命令 |

### 2. 进入项目根目录

后续所有命令都在仓库根目录执行。示例：

```powershell
cd D:\workspace\career-agent
```

如果目录不一样，换成自己的项目路径。

### 3. 准备后端环境变量文件

复制模板：

```powershell
Copy-Item infra\env\backend.env.example infra\env\backend.env
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `Copy-Item infra\env\backend.env.example infra\env\backend.env` | 从模板复制出本机真实配置文件 |

然后编辑：

```powershell
notepad infra\env\backend.env
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `notepad infra\env\backend.env` | 用记事本打开环境变量文件 |

至少填写 AI 和火山 TTS 配置。

完整 AI 模式推荐填写 Kimi Coding Key：

```env
KIMI_API_KEY=your_kimi_coding_api_key
KIMICODE_API_KEY=your_kimi_coding_api_key
```

如果使用 Moonshot，也可以填写：

```env
MOONSHOT_BASE_URL=https://api.moonshot.ai/v1
MOONSHOT_API_KEY=your_moonshot_api_key
```

岗位有声绘本使用火山 TTS，需要填写：

```env
VOLCENGINE_TTS_APP_ID=your_volcengine_app_id
VOLCENGINE_TTS_ACCESS_TOKEN=your_volcengine_access_token
```

注意：

- `infra\env\backend.env` 是本机私密配置，不要提交到 Git。
- 改完 `.env` 后，已经运行的容器不会自动读取新值，必须按“修改 env 后如何生效”章节重启服务。

### 4. 创建 Docker 数据卷

当前 Compose 使用固定名称的数据卷，方便不同环境保留数据。第一次部署前执行：

```powershell
docker volume create infra_pg_data
docker volume create infra_neo4j_data
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `docker volume create infra_pg_data` | 创建 PostgreSQL 数据卷，保存简历、学生画像、报告、岗位等数据库数据 |
| `docker volume create infra_neo4j_data` | 创建 Neo4j 数据卷，保存路径图谱数据 |

如果不创建，第一次 `docker compose up` 会因为 external volume 不存在而失败。

### 5. 确认本地文件存储目录存在

后端报告 PDF、Markdown、岗位绘本、岗位漫画等文件会写入：

```powershell
apps\backend\storage
```

如果目录不存在，执行：

```powershell
New-Item -ItemType Directory -Force apps\backend\storage
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `New-Item -ItemType Directory -Force apps\backend\storage` | 创建后端文件存储目录；目录已存在也不会报错 |

### 6. 检查 Compose 配置

正式启动前建议先检查配置文件能否被 Docker Compose 正确解析：

```powershell
docker compose -f infra/docker-compose.app.yml config
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `docker compose -f infra/docker-compose.app.yml config` | 展开并校验 Compose 配置；如果 volume、env_file、YAML 格式有问题，会在这里提前报错 |

## 三、第一次启动完整系统

推荐第一次启动使用前台模式，方便看初始化日志：

```powershell
docker compose -f infra/docker-compose.app.yml up --build
```

命令说明：

| 参数 | 功能 |
| --- | --- |
| `docker compose` | 使用 Docker Compose 管理多容器应用 |
| `-f infra/docker-compose.app.yml` | 指定使用完整应用的 Compose 文件 |
| `up` | 创建并启动所有服务 |
| `--build` | 启动前重新构建前端和后端镜像 |

首次启动顺序：

1. 启动 PostgreSQL。
2. 启动 Neo4j。
3. 等待 PostgreSQL 和 Neo4j 健康检查通过。
4. 执行 `init` 初始化容器。
5. 初始化知识库表结构。
6. 导入 `data\岗位数据.xls` 到岗位表。
7. 写入手工岗位画像。
8. 索引岗位数据。
9. 索引项目文档。
10. 启动后端。
11. 启动前端。

看到前端和后端都变成 healthy 后，就可以访问：

```text
http://localhost:5173
```

如果当前 PowerShell 被日志占用，按 `Ctrl + C` 会停止前台日志和容器。日常使用建议改用后台启动。

## 四、日常启动、停止、重启

### 后台启动

```powershell
docker compose -f infra/docker-compose.app.yml up -d
```

命令说明：

| 参数 | 功能 |
| --- | --- |
| `up` | 启动服务 |
| `-d` | detached mode，后台运行，不占用当前终端 |

### 后台启动并重新构建镜像

代码或 Dockerfile 改过后使用：

```powershell
docker compose -f infra/docker-compose.app.yml up -d --build
```

命令说明：

| 参数 | 功能 |
| --- | --- |
| `--build` | 启动前重新构建镜像，确保代码改动进入容器 |

### 停止服务但保留数据

```powershell
docker compose -f infra/docker-compose.app.yml down
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `down` | 停止并删除容器和默认网络，但保留数据卷和本地 storage 文件 |

这是最常用的停止命令。它不会删除简历、学生画像、报告、路径图谱数据。

### 重启所有服务

```powershell
docker compose -f infra/docker-compose.app.yml restart
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `restart` | 重启已经存在的容器，不重新构建镜像 |

### 重启某一个服务

只重启后端：

```powershell
docker compose -f infra/docker-compose.app.yml restart backend
```

只重启前端：

```powershell
docker compose -f infra/docker-compose.app.yml restart frontend
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `restart backend` | 只重启后端容器 |
| `restart frontend` | 只重启前端容器 |

## 五、修改 env 后如何生效

如果只改了：

```powershell
infra\env\backend.env
```

需要重新创建后端容器，让容器重新读取 env 文件：

```powershell
docker compose -f infra/docker-compose.app.yml up -d --force-recreate backend
```

命令说明：

| 参数 | 功能 |
| --- | --- |
| `--force-recreate` | 强制删除并重建容器，即使镜像没有变化 |
| `backend` | 只处理后端服务 |

如果改的是 AI Key，并且希望重新执行登录初始化，建议完整重启：

```powershell
docker compose -f infra/docker-compose.app.yml down
docker compose -f infra/docker-compose.app.yml up -d --build
```

也可以在后端容器里手动执行登录：

```powershell
docker compose -f infra/docker-compose.app.yml exec backend npm run agent:auth:kimi
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `exec backend ...` | 在正在运行的 backend 容器里执行命令 |
| `npm run agent:auth:kimi` | 使用 env 中的 Kimi/Moonshot 配置完成 Pi Agent 登录 |

查看登录状态：

```powershell
docker compose -f infra/docker-compose.app.yml exec backend npm run agent:auth:status
```

## 六、查看服务状态和日志

### 查看容器状态

```powershell
docker compose -f infra/docker-compose.app.yml ps
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `ps` | 查看每个服务是否 running、healthy，以及端口映射 |

### 查看全部日志

```powershell
docker compose -f infra/docker-compose.app.yml logs -f
```

命令说明：

| 参数 | 功能 |
| --- | --- |
| `logs` | 查看服务日志 |
| `-f` | follow，持续跟随新日志 |

### 查看最近 200 行日志

```powershell
docker compose -f infra/docker-compose.app.yml logs --tail 200
```

### 查看某个服务日志

查看后端：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f backend
```

查看初始化任务：

```powershell
docker compose -f infra/docker-compose.app.yml logs init
```

查看前端 Nginx：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f frontend
```

查看数据库：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f postgres
```

查看图数据库：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f neo4j
```

## 七、验证系统是否正常

### 1. 验证后端健康检查

```powershell
curl http://localhost:8000/healthz
```

正常会看到类似：

```json
{"status":"ok","env":"docker","database":"postgres://career@postgres:5432/career_agent"}
```

### 2. 验证前端页面

浏览器打开：

```text
http://localhost:5173
```

如果页面空白，先查看浏览器控制台，再按“常见问题”章节排查。

### 3. 验证 PostgreSQL 数据

查看核心数据数量：

```powershell
docker compose -f infra/docker-compose.app.yml exec postgres psql -U career -d career_agent -c "select 'student_profiles' as table_name, count(*) from student_profiles union all select 'resume_html_records', count(*) from ai_resume_html_records union all select 'match_results', count(*) from match_results union all select 'career_reports', count(*) from career_reports union all select 'path_graph_runs', count(*) from v2_career_path_graph_runs union all select 'jobs', count(*) from jobs order by table_name;"
```

命令说明：

| 片段 | 功能 |
| --- | --- |
| `exec postgres` | 进入 PostgreSQL 容器执行命令 |
| `psql -U career -d career_agent` | 使用 `career` 用户连接 `career_agent` 数据库 |
| `select ... count(*) ...` | 查看关键业务表是否有数据 |

### 4. 验证 Neo4j 图谱数据

```powershell
docker compose -f infra/docker-compose.app.yml exec neo4j cypher-shell -u neo4j -p career_dev_password "MATCH (n) RETURN count(n) AS nodes"
```

正常情况下会返回图谱节点数量。

### 5. 验证报告文件存储

```powershell
docker compose -f infra/docker-compose.app.yml exec backend sh -lc "find /app/apps/backend/storage/exports/reports -type f | head"
```

如果有报告文件，会输出若干 `.md` 或 `.pdf` 路径。

## 八、数据保存在哪里

### PostgreSQL 数据

保存到 Docker volume：

```text
infra_pg_data
```

里面包含：

- 简历 HTML 记录
- 学生画像
- 匹配结果
- 报告记录
- 岗位数据
- 知识库索引元数据

### Neo4j 数据

保存到 Docker volume：

```text
infra_neo4j_data
```

里面包含路径图谱节点和关系。

### 后端文件

保存到仓库目录：

```text
apps/backend/storage
```

里面包含：

- 报告导出的 Markdown/PDF
- 岗位漫画文件
- 岗位有声绘本文件
- 旧 JSON 存储文件

### Agent 登录和会话数据

保存到 Docker volume：

```text
career-agent-app_agent_data
```

里面包含 Pi Agent 的认证和会话信息。

## 九、备份和恢复演示数据

给队友部署时，如果希望带上你本机已有的简历、画像、报告、图谱数据，需要备份 PostgreSQL、Neo4j 和 `apps/backend/storage`。

当前仓库已经提供一份演示数据备份和一键导入脚本：

```text
infra\backups\current\postgres.sql
infra\backups\current\neo4j-data.tar.gz
infra\backups\current\backend-storage.zip
scripts\restore-docker-databases.ps1
```

队友在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1
```

这个脚本会自动执行：

1. 检查 Docker 和 Compose。
2. 检查 `infra\docker-compose.app.yml` 是否可解析。
3. 停止当前 Docker 服务。
4. 创建 `infra_pg_data` 和 `infra_neo4j_data`。
5. 清空并恢复 Neo4j volume。
6. 启动 PostgreSQL。
7. 清空 PostgreSQL `public` schema。
8. 导入 `postgres.sql`。
9. 恢复 `apps\backend\storage` 文件。
10. 构建并启动完整系统。

如果镜像已经构建过，只想恢复数据并启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-docker-databases.ps1 -SkipBuild
```

注意：导入脚本会覆盖目标电脑当前数据库数据和 `apps\backend\storage` 文件。运行前确认目标电脑不需要保留旧数据。

### 1. 备份 PostgreSQL

```powershell
docker compose -f infra/docker-compose.app.yml exec -T postgres pg_dump -U career -d career_agent > career_agent_pg_backup.sql
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `pg_dump` | 导出 PostgreSQL 数据库 |
| `>` | 把导出内容写入本机文件 |
| `career_agent_pg_backup.sql` | 备份文件名 |

### 2. 恢复 PostgreSQL

先确认目标电脑已经启动过 PostgreSQL，然后执行：

```powershell
Get-Content career_agent_pg_backup.sql | docker compose -f infra/docker-compose.app.yml exec -T postgres psql -U career -d career_agent
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `Get-Content career_agent_pg_backup.sql` | 读取 SQL 备份文件 |
| `psql -U career -d career_agent` | 把 SQL 执行到目标数据库 |

### 3. 备份 Neo4j volume

先停止服务，避免备份过程中数据还在写入：

```powershell
docker compose -f infra/docker-compose.app.yml down
```

然后执行：

```powershell
docker run --rm -v infra_neo4j_data:/data -v ${PWD}:/backup alpine tar czf /backup/neo4j-data.tar.gz -C /data .
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `docker run --rm` | 临时启动一个容器，执行完自动删除 |
| `-v infra_neo4j_data:/data` | 把 Neo4j 数据卷挂到临时容器的 `/data` |
| `-v ${PWD}:/backup` | 把当前目录挂到临时容器的 `/backup` |
| `tar czf` | 打包压缩 Neo4j 数据 |

### 4. 恢复 Neo4j volume

目标电脑先创建 volume：

```powershell
docker volume create infra_neo4j_data
```

然后恢复：

```powershell
docker run --rm -v infra_neo4j_data:/data -v ${PWD}:/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/neo4j-data.tar.gz -C /data"
```

### 5. 备份和恢复 storage 文件

备份时直接压缩：

```powershell
Compress-Archive -Path apps\backend\storage -DestinationPath backend-storage.zip -Force
```

恢复时解压回原位置：

```powershell
Expand-Archive -Path backend-storage.zip -DestinationPath apps\backend -Force
```

## 十、危险命令说明

### 不要随便执行 down -v

```powershell
docker compose -f infra/docker-compose.app.yml down -v
```

这个命令会停止容器，并删除 Compose 管理的数据卷。虽然当前 `infra_pg_data` 和 `infra_neo4j_data` 是 external volume，不会被 Compose 自动删除，但这个命令仍然容易造成误解，不建议新人使用。

### 删除指定数据卷

只有确认要清空数据库时才执行：

```powershell
docker volume rm infra_pg_data
docker volume rm infra_neo4j_data
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `docker volume rm infra_pg_data` | 删除 PostgreSQL 数据，简历、画像、报告数据库记录会丢失 |
| `docker volume rm infra_neo4j_data` | 删除 Neo4j 图谱数据 |

删除前建议先备份。

## 十一、常见问题

### 1. 打开页面空白，控制台提示 `index-*.js` 或 `index-*.css` 404

先确认前端容器是否是最新镜像：

```powershell
docker compose -f infra/docker-compose.app.yml up -d --build frontend
```

再查看 Nginx 日志：

```powershell
docker compose -f infra/docker-compose.app.yml logs -f frontend
```

如果 `http://localhost:5173/assets/index-xxx.js` 返回 404，通常是前端静态资源没有重新构建，或浏览器缓存了旧 HTML。处理方式：

1. 执行 `up -d --build frontend`。
2. 浏览器强制刷新，Windows 使用 `Ctrl + F5`。
3. 仍然不行就完整重建：

```powershell
docker compose -f infra/docker-compose.app.yml down
docker compose -f infra/docker-compose.app.yml up -d --build
```

### 2. 修改 env 后 AI 仍然不能用

先重建后端容器：

```powershell
docker compose -f infra/docker-compose.app.yml up -d --force-recreate backend
```

再手动执行登录：

```powershell
docker compose -f infra/docker-compose.app.yml exec backend npm run agent:auth:kimi
```

查看状态：

```powershell
docker compose -f infra/docker-compose.app.yml exec backend npm run agent:auth:status
```

### 3. `external volume "infra_pg_data" not found`

说明没有创建 PostgreSQL 数据卷。执行：

```powershell
docker volume create infra_pg_data
```

如果 Neo4j 也报类似错误：

```powershell
docker volume create infra_neo4j_data
```

### 4. 端口被占用

查看占用端口的进程：

```powershell
netstat -ano | findstr :5173
netstat -ano | findstr :8000
netstat -ano | findstr :5433
netstat -ano | findstr :7474
netstat -ano | findstr :7687
```

命令说明：

| 命令 | 功能 |
| --- | --- |
| `netstat -ano` | 查看本机端口占用 |
| `findstr :5173` | 过滤指定端口 |

如果端口被其他程序占用，可以先关闭占用程序，或者修改 `infra\docker-compose.app.yml` 的端口映射。

### 5. 后端启动失败

查看后端日志：

```powershell
docker compose -f infra/docker-compose.app.yml logs --tail 200 backend
```

重点看：

- env 是否缺少必要配置。
- PostgreSQL 是否 healthy。
- Neo4j 是否 healthy。
- AI Key 是否无效。

### 6. 初始化失败

查看 init 日志：

```powershell
docker compose -f infra/docker-compose.app.yml logs init
```

常见原因：

- `data\岗位数据.xls` 不存在。
- PostgreSQL 或 Neo4j 没启动成功。
- AI Key 不可用，导致 Pi 登录失败。

如果只是 AI Key 没配置，init 会跳过 Pi 登录，不影响基础数据初始化。

### 7. 数据看起来没了

先不要删除 volume。执行：

```powershell
docker volume ls
```

确认是否存在：

```text
infra_pg_data
infra_neo4j_data
```

再查数据库数量：

```powershell
docker compose -f infra/docker-compose.app.yml exec postgres psql -U career -d career_agent -c "select count(*) from student_profiles;"
```

如果旧数据在别的 volume 里，不要执行 `down -v`，需要先确认旧 volume 名称，再迁移或修改 compose。

## 十二、常用命令速查

| 命令 | 功能 |
| --- | --- |
| `docker version` | 检查 Docker 是否可用 |
| `docker compose version` | 检查 Docker Compose 是否可用 |
| `docker volume create infra_pg_data` | 创建 PostgreSQL 数据卷 |
| `docker volume create infra_neo4j_data` | 创建 Neo4j 数据卷 |
| `docker compose -f infra/docker-compose.app.yml config` | 检查 Compose 配置是否能被解析 |
| `docker compose -f infra/docker-compose.app.yml up --build` | 前台构建并启动全部服务 |
| `docker compose -f infra/docker-compose.app.yml up -d` | 后台启动全部服务 |
| `docker compose -f infra/docker-compose.app.yml up -d --build` | 后台重新构建并启动全部服务 |
| `docker compose -f infra/docker-compose.app.yml ps` | 查看服务运行状态 |
| `docker compose -f infra/docker-compose.app.yml logs -f` | 跟随全部服务日志 |
| `docker compose -f infra/docker-compose.app.yml logs -f backend` | 跟随后端日志 |
| `docker compose -f infra/docker-compose.app.yml logs init` | 查看初始化日志 |
| `docker compose -f infra/docker-compose.app.yml restart backend` | 重启后端 |
| `docker compose -f infra/docker-compose.app.yml restart frontend` | 重启前端 |
| `docker compose -f infra/docker-compose.app.yml down` | 停止并删除容器，保留数据 |
| `docker compose -f infra/docker-compose.app.yml exec backend sh` | 进入后端容器 shell |
| `docker compose -f infra/docker-compose.app.yml exec postgres psql -U career -d career_agent` | 进入 PostgreSQL 命令行 |
| `docker compose -f infra/docker-compose.app.yml exec neo4j cypher-shell -u neo4j -p career_dev_password` | 进入 Neo4j 命令行 |
| `curl http://localhost:8000/healthz` | 检查后端健康状态 |
