# ---------- deps: install all dependencies ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------- builder: build Next.js standalone ----------
FROM deps AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV AI_DATABASE_MODE=memory
ENV NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
COPY . .
RUN pnpm next build

# ---------- runner: minimal production image ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV AI_DATABASE_MODE=memory
ENV AUTH_SECRET=demo-secret-key-for-showcase-only-32chars
ENV NEXT_TELEMETRY_DISABLED=1
RUN useradd -m -u 1001 nodejs
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
USER nodejs
EXPOSE 3000
CMD ["node", "server.js"]
