# @career/contracts

前后端共享契约包，避免接口联调口径漂移。

## 目录

- `openapi/career-agent.openapi.yaml`：OpenAPI 契约
- `types/index.ts`：共享 TypeScript 类型

## 使用方式

后端和前端统一从 `@career/contracts/types` 导入类型。

## 变更规则

1. 接口字段有变更时，先更新本包。
2. 再更新后端实现。
3. 最后更新前端消费。

## 校验

```bash
npm run type-check -w @career/contracts
```
