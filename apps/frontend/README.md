# Career Agent Frontend

## 启动（从仓库根目录）

```bash
npm run dev:frontend
```

## 目录规范

前端必须按以下分层：

- `src/app`：应用装配（入口、router、provider）
- `src/features/<feature>`：业务功能
- `src/shared`：共享能力（api/ui/utils）

当前示例 feature：

- `features/dashboard`
- `features/profile`

## 配置

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

支持变量：

- `VITE_API_BASE_URL`

## 开发要求

1. 新页面必须进入对应 feature，不得直接放在 `src/` 根目录。
2. 共享接口类型优先使用 `@career/contracts/types`。
