# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package.json ./

# Install ALL deps (including devDependencies for tsc)
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/

# Produces dist/ with JS + copies src/db/migrations → dist/db/migrations
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy manifests for production install
COPY package.json ./

# Install production deps only
RUN npm install --omit=dev

# Copy compiled output (includes dist/db/migrations)
COPY --from=builder /app/dist ./dist

# Fly.io injects PORT; default to 3000 for local docker run
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
