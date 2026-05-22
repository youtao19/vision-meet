# GEMINI.md

## Project Overview

**Career Agent** is an AI-powered monorepo project designed to provide career planning and job matching for college students. It integrates career path analysis, job intelligence, and student profiling using a modern tech stack centered around AI agents and vector search.

### Core Technologies

- **Monorepo:** Managed via `npm workspaces`.
- **Frontend:** Vue 3, TypeScript, Pinia, Vite.
- **Backend:** Node.js, Express, TypeScript, Zod, pgvector.
- **Data Layer:** PostgreSQL (with pgvector for RAG), Neo4j (target for graph-based path analysis).
- **AI Agent:** Integrated via **Pi Coding Agent SDK** as the primary runtime model.
- **Contracts:** OpenAPI 3.0 + Shared TypeScript types for cross-layer consistency.

## Building and Running

### Prerequisites

- **Node.js:** `22.20.0` (strict requirement via `.nvmrc` and `.node-version`).
- **Docker:** Required for running the database services.

### Key Commands (Run from root)

- **Setup:** `npm install`
- **Infrastructure:** `docker compose -f infra/docker-compose.yml up -d postgres`
- **Development:** `npm run dev` (starts both frontend and backend).
- **Type Checking:** `npm run type-check` (runs type checks for all workspaces).
- **Building:** `npm run build` (builds contracts, backend, and frontend).
- **Formatting:** `npm run format` (uses Prettier).
- **Data Pipeline:** `npm run data:pipeline:sync` (prepares and imports job data).
- **AI Tasks:**
  - `npm run agent:smoke` (model connectivity check).
  - `npm run knowledge:init` (initialize vector store).
  - `npm run knowledge:index:jobs` (index job data).

## Development Conventions

### 1. Contracts-First Development

All API changes **MUST** follow this sequence:

1. Update `packages/contracts/openapi/career-agent.openapi.yaml`.
2. Update `packages/contracts/types/index.ts`.
3. Implement backend changes (`apps/backend`).
4. Implement frontend changes (`apps/frontend`).

### 2. Backend Architecture (`apps/backend`)

Follow the strict layered pattern for every module in `src/modules/<domain>`:

- `*.route.ts`: Protocol handling and response mapping.
- `*.schemas.ts`: Parameter validation using Zod.
- `*.service.ts`: Business logic and workflow orchestration.
- `*.repository.ts`: Abstract storage interface.
- `*.repository.<adapter>.ts`: Implementation (e.g., `pg.ts` for PostgreSQL).

### 3. Frontend Architecture (`apps/frontend`)

Strict modularity in `src/`:

- `app/`: Application assembly (entry, router, providers).
- `features/<feature>/`: Business domains (pages, local components, stores).
- `shared/`: Cross-cutting concerns (api client, common ui, utils).
- **Rule:** Features must not couple directly; shared logic must descend to `shared/`.

### 4. AI & Model Constraints

- **Primary Path:** Use `Pi Coding Agent` for all business LLM logic.
- **Prohibited:** Do not introduce direct `OpenAI Chat Completions` clients or independent LLM scripts in the backend business flow.
- **Configuration:** Agent settings are stored in `~/.career-agent/pi-agent`. Use `npm run agent:auth -- list` and `npm run agent:auth -- login <provider> --model <provider/model>` to set up Pi-supported login methods.

### 5. Environment & Documentation

- Maintain `.env.example` in both `apps/frontend` and `apps/backend`.
- Update `docs/问题记录库.jsonl` (Problem Log) after fixing significant bugs.
- Align with `docs/工程结构与协作规范.md` for any structural changes.

## Directory Structure Highlights

- `apps/`: Main applications (frontend/backend).
- `packages/contracts/`: Source of truth for API and shared types.
- `infra/`: Docker and SQL initialization scripts.
- `data/`: Sample data and evaluation datasets.
- `docs/`: In-depth architecture, specifications, and collaboration norms.
- `scripts/`: Utility scripts for data pipelines and maintenance.
