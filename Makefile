SHELL := /bin/zsh

.PHONY: help install dev dev-backend dev-frontend type-check build infra-up infra-down docker-app-up docker-app-start docker-app-stop docker-app-restart docker-app-down docker-app-logs

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
	@echo "  make docker-app-up   # Build and start full Docker app stack"
	@echo "  make docker-app-start# Start existing full Docker app containers"
	@echo "  make docker-app-stop # Stop full Docker app containers without deleting them"
	@echo "  make docker-app-restart # Restart full Docker app containers"
	@echo "  make docker-app-down # Stop and remove full Docker app containers"
	@echo "  make docker-app-logs # Tail full Docker app stack logs"

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

docker-app-up:
	docker compose -f infra/docker-compose.app.yml up --build

docker-app-start:
	docker compose -f infra/docker-compose.app.yml start

docker-app-stop:
	docker compose -f infra/docker-compose.app.yml stop

docker-app-restart:
	docker compose -f infra/docker-compose.app.yml restart

docker-app-down:
	docker compose -f infra/docker-compose.app.yml down

docker-app-logs:
	docker compose -f infra/docker-compose.app.yml logs -f
