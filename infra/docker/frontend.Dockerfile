FROM node:22.20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci \
  && node -e "const arch=process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : ''; if (!arch) throw new Error('Unsupported native linux binding arch=' + process.arch); const packages=[]; const rolldown=require('./apps/frontend/node_modules/rolldown/package.json'); const rolldownName='@rolldown/binding-linux-' + arch + '-gnu'; packages.push(rolldownName + '@' + rolldown.optionalDependencies[rolldownName]); const lightning=require('./apps/frontend/node_modules/lightningcss/package.json'); const lightningName='lightningcss-linux-' + arch + '-gnu'; packages.push(lightningName + '@' + lightning.optionalDependencies[lightningName]); console.log(packages.join(' '));" \
    | xargs npm install --no-save --no-audit --no-fund

COPY apps/frontend apps/frontend
COPY packages/contracts packages/contracts

ARG VITE_API_BASE_URL=http://localhost:5173
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build:frontend

FROM nginx:1.27-alpine

COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
