# AML Detection Platform — Product Requirements Document

## Original Problem Statement
Design and implement a complete Anti-Money Laundering (AML) detection platform that identifies layering behavior in financial transactions using sequence modeling, NLP, and graph analytics. Backend FastAPI, frontend React, simulated Zimbabwean transactions.

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`), MongoDB via Motor, JWT auth, emergentintegrations LlmChat (OpenAI gpt-4o-mini), networkx for graph analytics.
- **Frontend**: React 19 + react-router-dom, Tailwind, Shadcn UI, recharts (KPI charts), react-force-graph-2d (network graph), @phosphor-icons/react, sonner toasts.
- **Auth**: JWT (HS256, 7-day expiry). Seeded compliance officer.
- **Data**: 171 simulated transactions across 6 Zimbabwean banks + 3 mobile money providers, including structuring (smurfing), layering chain, fan-out patterns.

## User Personas
- **Compliance Officer** (RBZ): triages alerts, investigates layering networks, files SARs.

## Core Requirements
1. Deep-Learning-style sequence detection (heuristic LSTM-mimicking signals: velocity, structuring, fan-out, cross-institution rapid hop).
2. NLP keyword scan + OpenAI GPT-4o-mini explanation.
3. Graph analytics: ego subgraph, downstream chain depth, cycle detection.
4. SAR generation/listing.
5. Real-time alerts feed with severity.

## What's Implemented (2026-04-28)
- JWT login (officer@rbz.co.zw / aml2026)
- Auto-seeding of users + Zimbabwean transactions on first startup
- Full detection pipeline (DL + NLP + Graph) with combined risk scoring
- Dashboard: KPIs, 14-day volume timeseries, risk distribution pie, institution bar chart, live alerts feed
- Transactions page: filterable table (risk, institution, channel, flagged-only, search)
- Investigation page: react-force-graph 2D network, side panel of flagged tx, detail card with NLP keyword highlighting + DL/Graph signals + risk gauge breakdown
- Alerts page: triage with status filters (open/under_review/resolved), Review/Resolve actions
- SARs page: filed reports, JSON download
- Detection scan endpoint that re-scores all transactions

## Update (2026-04-29) — SQLite migration
- Replaced MongoDB with **SQLite** (aiosqlite) per original problem statement. Single file at `data/aml.db`, no DB server install needed.
- Schema auto-created on startup; list fields stored as JSON-encoded TEXT.
- Removed `mongo` service from `docker-compose.yml`; backend now uses a `aml_data` volume mounted at `/app/data`.
- Updated `.env.example` (removed `MONGO_URL`, added `SQLITE_PATH`).
- All endpoints unchanged from frontend's perspective — same JSON contracts.

## Update (2026-04-29) — Repo packaging
- Added committed dataset at `/app/data/transactions.json` and `/app/data/transactions.csv` (171 records). `seed_data()` now loads from JSON if present, otherwise generates programmatically.
- Added `GET /api/export/transactions.csv` endpoint and "Export CSV" button on Transactions page.
- Added Docker setup: `backend/Dockerfile`, `frontend/Dockerfile` (nginx-served), `frontend/nginx.conf`, root `docker-compose.yml`, `.env.example`.
- Rewrote `README.md` with `docker compose up` quickstart and manual run instructions.

## Test Results (iteration 1)
- Backend: 13/13 pytest passed (100%)
- Frontend: All flows verified via Playwright (100%)

## Prioritized Backlog
- **P1**: Cache NLP LLM results per transaction (avoid per-request cost on /api/transactions/{id}).
- **P1**: Preserve operator alert notes/status across re-scans (upsert instead of wipe).
- **P2**: Split server.py into modules (routes/, detection/, models/).
- **P2**: Build NetworkX graph once per scan instead of per transaction.
- **P3**: Show NLP LLM explanation in alert reason; richer SAR template (PDF export).
- **P3**: Add PDF export for SARs and a tx-level audit trail.
