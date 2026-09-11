# Web app image. Build/run from the repo root:
#   docker compose up --build
# See docker-compose.yml (runs this alongside services/frame-processor's
# Dockerfile) and README.md's "Running with Docker" section.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` demands the lockfile's dependency-tree shape match exactly what
# the image's own bundled npm would resolve — Tailwind v4's optional WASM
# fallback (@tailwindcss/oxide's nested @emnapi/* deps) is exactly the kind
# of optional/platform-gated subtree that shifts between npm versions, so a
# lockfile that's fine with one npm version can make `npm ci` hard-fail on
# another. `npm install` still resolves from the lockfile as its baseline,
# it just tolerates that instead of erroring.
RUN npm install

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# next.config.ts has output: "standalone" — this copies only the files a
# production server actually needs, not the full node_modules tree.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
