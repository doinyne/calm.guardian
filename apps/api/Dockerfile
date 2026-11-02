# syntax=docker/dockerfile:1
# Build from the repo root, because the API depends on packages/shared:
#   docker build -f apps/api/Dockerfile -t calm-guardian-api .

FROM node:26-slim AS build
WORKDIR /repo

# Manifests first, so the dependency layer is cached until they change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @calm-guardian/api --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
RUN npm run build --workspace @calm-guardian/api

# The bundle has no runtime dependencies, so the final image is just Node and one file.
FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.cjs"]
