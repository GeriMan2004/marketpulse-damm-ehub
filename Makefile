# MarketPulse UK — dev ergonomics
#
# Usage:
#   make install     install backend + frontend deps
#   make data        run the ETL pipeline (raw Excel → snapshots/*.parquet)
#   make train       fit forecast ensemble + write models + snapshots
#   make backend     run FastAPI on :8000 (auto-reload)
#   make frontend    run Vite on :5173
#   make demo        run both, logs interleaved (the demo command)
#   make types       regenerate frontend TS types from /openapi.json
#   make snapshot    write a deterministic snapshot bundle for offline demo
#   make clean       remove caches, build artifacts
#   make doctor      check that hf, mongo, hf token, and python are all ready

SHELL := /bin/bash
PY    := PYTHONHASHSEED=42 uv run python   # deterministic anonymization hashes for our scripts only

BE  := backend
FE  := frontend
PNPM := pnpm

# ---------- install ----------

.PHONY: install install-be install-fe
install: install-be install-fe

install-be:
	cd $(BE) && uv sync

install-fe:
	cd $(FE) && $(PNPM) install

# ---------- data + training ----------

.PHONY: data train snapshot
data:
	cd $(BE) && $(PY) -m app.services.etl

train: data
	cd $(BE) && $(PY) -m app.services.forecast.train

snapshot: train
	cd $(BE) && $(PY) -m app.services.snapshot.build

# ---------- servers ----------

.PHONY: backend frontend demo
backend:
	cd $(BE) && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd $(FE) && $(PNPM) dev

# Run both with interleaved logs — the demo command
demo:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

# ---------- frontend types ----------

.PHONY: types
types:
	cd $(FE) && $(PNPM) exec openapi-typescript http://localhost:8000/openapi.json -o src/lib/api.gen.ts

# ---------- housekeeping ----------

.PHONY: clean doctor
clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
	find . -type d -name .mypy_cache -exec rm -rf {} +
	rm -rf $(FE)/dist $(FE)/.vite $(FE)/node_modules/.vite
	rm -rf $(BE)/app/data/cache/*.parquet

doctor:
	@echo "→ HF CLI..."; command -v hf >/dev/null && hf --version || echo "  ❌ install via: pip3 install --break-system-packages -U huggingface_hub"
	@echo "→ HF token..."; test -s ~/.cache/huggingface/token && echo "  ✓ token present" || echo "  ❌ run: hf auth login"
	@echo "→ HF whoami..."; hf auth whoami 2>/dev/null || echo "  ❌ token invalid"
	@echo "→ uv...";  command -v uv  >/dev/null && uv --version  || echo "  ❌ install via: brew install uv"
	@echo "→ pnpm..."; command -v pnpm >/dev/null && pnpm --version || echo "  ❌ install via: brew install pnpm"
	@echo "→ raw data..."; test -d $(BE)/app/data/raw && ls $(BE)/app/data/raw/*.xlsx 2>/dev/null | wc -l | awk '{print "  ✓ " $$1 " xlsx file(s) present"}' || echo "  ❌ copy UK DATA.xlsx + 'Damm Trade Plan - promotions.xlsx' to $(BE)/app/data/raw/"
	@echo "→ MongoDB..."; nc -z localhost 27017 2>/dev/null && echo "  ✓ reachable on :27017" || echo "  ⚠️  optional — set MONGO_URI in .env if using a different host"
