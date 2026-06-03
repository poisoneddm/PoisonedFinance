# PoisonedFinance

Personal finance app aggregating UK bank accounts via Open Banking (TrueLayer), auto-categorising transactions with AI (Groq / Llama 3.3), and tracking spending against a 40/20/40 Needs/Wants/Savings budget.

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for local Postgres or image builds)
- A running PostgreSQL instance (or `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine`)

### API

```bash
# 1. Install dependencies
cd api && npm install

# 2. Copy and fill in environment variables
cp api/.env.example api/.env
# Edit api/.env — set DATABASE_URL, ENCRYPTION_KEY, GROQ_API_KEY, TRUELAYER_*

# 3. Start in dev mode (ts-node-dev, auto-restart on change)
#    Runs migrations on boot then starts Express on PORT (default 3000)
cd api && npm run dev

# 4. Check the API is healthy
curl http://localhost:3000/health
# → {"ok":true,"db":"connected"}
```

### Mobile

```bash
cd mobile && npm install
cd mobile && npx expo start
```

---

## Running Tests

### API unit tests

```bash
cd api && npm test
```

### Mobile unit tests

```bash
cd mobile && npm test
```

### BDD feature specs (jest-cucumber, all including @wip)

```bash
cd api && npm test -- --testPathPattern="__tests__/features"
```

### BDD feature specs (non-@wip only — mirrors CI blocking step)

```bash
cd api && npm test -- --testPathPattern="__tests__/features" --testNamePattern="^(?!.*@wip)"
```

---

## Building the Docker Image

```bash
# Build from repo root (context is api/)
docker build -t pf-api ./api

# Run locally against a Postgres instance
docker run \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/poisonedfinance" \
  -e ENCRYPTION_KEY="<your-key>" \
  -e GROQ_API_KEY="gsk_..." \
  -e TRUELAYER_CLIENT_ID="..." \
  -e TRUELAYER_CLIENT_SECRET="..." \
  -e TRUELAYER_REDIRECT_URI="http://localhost:3000/auth/callback" \
  -p 3000:3000 \
  pf-api
```

---

## Deployment (Fly.io)

### First-time setup

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Log in
flyctl auth login

# Create the app (once)
fly apps create poisonedfinance-api --org personal

# Attach a Fly.io Postgres database (once)
fly postgres create --name poisonedfinance-pg --region lhr
fly postgres attach poisonedfinance-pg --app poisonedfinance-api

# Set all runtime secrets (see docs/superpowers/plans/2026-06-01-deploy-ci.md Task 5)
fly secrets set \
  ENCRYPTION_KEY="<32-byte base64>" \
  GROQ_API_KEY="gsk_..." \
  TRUELAYER_CLIENT_ID="..." \
  TRUELAYER_CLIENT_SECRET="..." \
  --app poisonedfinance-api
# DATABASE_URL is set automatically by fly postgres attach
```

### Deploy manually

```bash
# Run from api/ — fly.toml and Dockerfile must share the same build context
cd api
flyctl deploy --remote-only --app poisonedfinance-api
```

### Automated deploy

Push to (or merge a PR into) `main`. The `.github/workflows/deploy.yml` workflow runs `flyctl deploy --remote-only` automatically.

Requires `FLY_API_TOKEN` set in GitHub repo Secrets:
```bash
fly tokens create deploy -x 999999h --app poisonedfinance-api
# Copy output → GitHub Settings → Secrets → Actions → FLY_API_TOKEN
```

### Check deployment status

```bash
fly status --app poisonedfinance-api
fly logs --app poisonedfinance-api
```
