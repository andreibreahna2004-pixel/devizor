#!/usr/bin/env bash
# Pregateste mediul ca testele si build-ul sa poata rula imediat.
# Idempotent: nu reface ce e deja facut.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

log() { echo "[devizor] $*" >&2; }

[ -d node_modules ] || { log "npm install..."; npm install --no-audit --no-fund >/dev/null 2>&1; }

if [ ! -f .env ]; then
  log "creez .env"
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "dev-secret-$RANDOM$RANDOM")
  cat > .env <<ENV
DATABASE_URL="postgresql://devizor:devizor@127.0.0.1:5432/devizor?schema=public"
AUTH_SECRET="$SECRET"
ANTHROPIC_API_KEY=""
ENV
fi

if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q 2>/dev/null; then
  log "pornesc PostgreSQL..."
  (pg_ctlcluster 16 main start >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1) || true
  for _ in $(seq 1 15); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi

if pg_isready -q 2>/dev/null; then
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='devizor'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c \"CREATE ROLE devizor LOGIN PASSWORD 'devizor' SUPERUSER;\"" >/dev/null 2>&1
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='devizor'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "createdb -O devizor devizor" >/dev/null 2>&1

  log "aplic migrarile..."
  npx prisma migrate deploy >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1
  log "gata — npm test / npm run dev"
else
  log "PostgreSQL nu porneste; testele care ating baza de date vor esua"
fi

exit 0
