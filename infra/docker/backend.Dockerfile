FROM node:22.20-bookworm-slim

WORKDIR /app

RUN apt-get -o Acquire::Retries=3 update \
  && apt-get install -y --no-install-recommends ca-certificates curl poppler-utils fonts-wqy-zenhei libglib2.0-0 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libcups2 libxkbcommon0 libasound2 libgbm1 libpango-1.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libatspi2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci \
  && npx playwright install chromium

COPY . .

RUN chmod +x infra/docker/backend-entrypoint.sh infra/docker/init.sh \
  && npm run build:contracts \
  && npm run build:backend

ENV APP_ENV=docker
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "infra/docker/backend-entrypoint.sh"]
