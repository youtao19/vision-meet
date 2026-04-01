SHELL := /bin/zsh

.PHONY: help install dev dev-backend dev-frontend type-check build infra-up infra-down

help:
	@echo "Available targets:"
	@echo "  make install     # Install dependencies for all workspaces"
	@echo "  make dev         # Run backend + frontend in parallel"
	@echo "  make dev-backend # Run backend only"
	@echo "  make dev-frontend# Run frontend only"
	@echo "  make type-check  # Run type-check for contracts/backend/frontend"
	@echo "  make build       # Build contracts/backend/frontend"
	@echo "  make infra-up    # Start Postgres(pgvector) + Neo4j"
	@echo "  make infra-down  # Stop infrastructure services"

install:
	npm install

dev:
	npm run dev

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev:frontend

type-check:
	npm run type-check

build:
	npm run build

infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down
