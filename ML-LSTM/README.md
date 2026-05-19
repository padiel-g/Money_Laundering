# AML Detection Platform — Zimbabwe

Anti-Money Laundering platform that detects layering schemes across Zimbabwean banks
(CBZ, Stanbic, Steward, ZB, FBC, Nedbank) and mobile money (EcoCash, OneMoney, InnBucks)
using a 3-layer engine:

1. **Sequence model (DL heuristic)** — velocity, structuring (sub-USD-10k), fan-out, cross-institution rapid hop
2. **NLP** — keyword scan + OpenAI GPT-4o-mini enrichment via Emergent LLM key (optional)
3. **Graph analytics** — NetworkX ego subgraph, downstream chain depth, fund cycle detection

## Stack
FastAPI · **SQLite** (single-file, zero install) · React 19 · Tailwind · Shadcn UI · react-force-graph-2d · networkx

## Demo credentials
- Email: `officer@rbz.co.zw`
- Password: `aml2026`

---

## Run with Docker (easiest)

**Prerequisites:** Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000` and log in. The backend auto-creates the SQLite DB at
`./data/aml.db` (mounted volume) and seeds 171 simulated Zimbabwean transactions on
first run.

To wipe and start fresh:
```bash
docker compose down -v && docker compose up --build
```

---

## Run manually (no Docker, no MongoDB needed)

SQLite is embedded — you don't need to install or run any database server.

### 1. Backend

```bash
cd backend
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

Create `backend/.env`:
```
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=change-me
EMERGENT_LLM_KEY=
# Optional: override default DB path (default is ../data/aml.db)
# SQLITE_PATH=C:/path/to/aml.db
```

Run:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

You should see:
```
Seeded compliance officer account
Loaded 171 transactions from /path/to/data/transactions.json
Scan complete: 47 alerts generated
```

The SQLite DB file is created at `<repo>/data/aml.db`.

### 2. Frontend (separate terminal)

```bash
cd frontend
yarn install
```

Create `frontend/.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
```

Run:
```bash
yarn start
```

Open http://localhost:3000 and log in with `officer@rbz.co.zw` / `aml2026`.

---

## Dataset

The committed dataset is at `data/transactions.json` (171 records) and `data/transactions.csv`:
- 171 simulated transactions across 14 days
- Includes structuring (smurfing), 5-hop layering chain, and fan-out clusters
- Backend `seed_data()` loads it automatically; if missing it falls back to programmatic generation
- Auth-required CSV export: `GET /api/export/transactions.csv`

To inspect the SQLite DB directly:
```bash
sqlite3 data/aml.db
.tables
SELECT count(*) FROM transactions;
SELECT severity, count(*) FROM alerts GROUP BY severity;
```

---

## Key API endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | JWT login |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/dashboard/stats` | KPIs + timeseries + by-institution |
| GET  | `/api/transactions` | List + filters (risk_level, institution, channel, flagged_only) |
| GET  | `/api/transactions/{id}` | Single tx with full DL/NLP/Graph analysis (LLM-enriched) |
| GET  | `/api/export/transactions.csv` | Download all transactions as CSV |
| GET  | `/api/alerts` | List alerts (filter by status) |
| PATCH| `/api/alerts/{id}` | Update alert status (open / under_review / resolved) |
| GET  | `/api/graph/network?account=&depth=` | Force-graph nodes & links |
| POST | `/api/sars` | File a Suspicious Activity Report |
| GET  | `/api/sars` | List SARs |
| POST | `/api/scan/run` | Re-score all transactions and regenerate alerts |
| POST | `/api/data/seed` | Force re-seed and re-scan |

---

## Schema

SQLite tables (auto-created on first startup):
- `users(id, email, name, role, password)`
- `transactions(id, timestamp, sender_*, receiver_*, amount, currency, description, channel, risk_score, risk_level, flagged, nlp_keywords, dl_signals, graph_signals)`
- `alerts(id, transaction_id, severity, reason, status, created_at, notes)`
- `sars(id, transaction_ids, primary_subject, summary, risk_assessment, created_at, created_by, reference_no)`

List fields are stored as JSON-encoded text.
