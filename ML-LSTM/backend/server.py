"""AML Detection Platform - FastAPI Backend (SQLite edition)
Combines deep learning (sequence heuristic), NLP (Emergent LLM), and graph analytics.
"""
import os
import uuid
import json
import asyncio
import logging
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt as pyjwt
import networkx as nx
import aiosqlite

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- Config ----------
DB_PATH = os.environ.get('SQLITE_PATH', str(ROOT_DIR.parent / 'data' / 'aml.db'))
RESET_MARKER = ROOT_DIR.parent / 'data' / '.transactions_reset'
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

def get_cors_origins() -> List[str]:
    configured = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    return list(dict.fromkeys(configured + defaults))

# Make sure parent dir exists
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AML Detection Platform")
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger("aml")

# ---------- DB helpers ----------
async def get_db():
    """Returns a new connection. Caller must close."""
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL;")
    await conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def _row_to_dict(row) -> Dict:
    return {k: row[k] for k in row.keys()}

def _tx_from_row(row) -> Dict:
    d = _row_to_dict(row)
    d['flagged'] = bool(d.get('flagged'))
    for k in ('nlp_keywords', 'dl_signals', 'graph_signals'):
        v = d.get(k)
        d[k] = json.loads(v) if v else []
    return d

async def init_schema():
    conn = await get_db()
    try:
        await conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customer_accounts (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            account_number TEXT NOT NULL,
            institution TEXT NOT NULL,
            balance REAL NOT NULL DEFAULT 0,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(account_number, institution)
        );
        CREATE INDEX IF NOT EXISTS idx_customer_account ON customer_accounts(account_number, institution);
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            sender_account TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            sender_institution TEXT NOT NULL,
            receiver_account TEXT NOT NULL,
            receiver_name TEXT NOT NULL,
            receiver_institution TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            description TEXT NOT NULL,
            channel TEXT NOT NULL,
            risk_score REAL DEFAULT 0,
            risk_level TEXT DEFAULT 'low',
            flagged INTEGER DEFAULT 0,
            nlp_keywords TEXT DEFAULT '[]',
            dl_signals TEXT DEFAULT '[]',
            graph_signals TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
        CREATE INDEX IF NOT EXISTS idx_tx_sender ON transactions(sender_account);
        CREATE INDEX IF NOT EXISTS idx_tx_receiver ON transactions(receiver_account);
        CREATE INDEX IF NOT EXISTS idx_tx_risk ON transactions(risk_level);

        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL,
            severity TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            created_at TEXT NOT NULL,
            notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

        CREATE TABLE IF NOT EXISTS sars (
            id TEXT PRIMARY KEY,
            transaction_ids TEXT NOT NULL,
            primary_subject TEXT NOT NULL,
            summary TEXT NOT NULL,
            risk_assessment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            reference_no TEXT NOT NULL
        );
        """)
        await conn.commit()
    finally:
        await conn.close()

# ---------- Models ----------
class User(BaseModel):
    id: str
    email: str
    name: str
    role: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class Transaction(BaseModel):
    id: str
    timestamp: str
    sender_account: str
    sender_name: str
    sender_institution: str
    receiver_account: str
    receiver_name: str
    receiver_institution: str
    amount: float
    currency: str
    description: str
    channel: str
    risk_score: float = 0.0
    risk_level: str = "low"
    flagged: bool = False
    nlp_keywords: List[str] = []
    dl_signals: List[str] = []
    graph_signals: List[str] = []

class Alert(BaseModel):
    id: str
    transaction_id: str
    severity: str
    reason: str
    status: str = "open"
    created_at: str
    notes: Optional[str] = None

class AlertStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class SAR(BaseModel):
    id: str
    transaction_ids: List[str]
    primary_subject: str
    summary: str
    risk_assessment: str
    created_at: str
    created_by: str
    reference_no: str

class CreateSARIn(BaseModel):
    transaction_ids: List[str]
    primary_subject: str
    summary: str
    risk_assessment: str

class Customer(BaseModel):
    id: str
    full_name: str
    account_number: str
    institution: str
    balance: float

class CustomerLoginIn(BaseModel):
    institution: str
    account_number: str
    pin: str

class CustomerToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    customer: Customer

class CustomerTransactionIn(BaseModel):
    receiver_account: str
    receiver_name: str
    receiver_institution: str
    amount: float = Field(gt=0)
    currency: str = Field(default="USD", pattern=r"^[A-Za-z]{3}$")
    description: str

class SimulatorTransactionIn(BaseModel):
    sender_institution: str
    sender_account: str
    sender_name: str
    receiver_institution: str
    receiver_account: str
    receiver_name: str
    amount: float = Field(gt=0)
    currency: str = Field(default="USD", pattern=r"^[A-Za-z]{3}$")
    description: str

# ---------- Auth ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def check_pw(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def make_token(user_id: str, subject_type: str = "admin") -> str:
    payload = {
        "sub": user_id,
        "typ": subject_type,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        if payload.get("typ", "admin") != "admin":
            raise HTTPException(401, "Invalid token")
        uid = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")
    conn = await get_db()
    try:
        async with conn.execute("SELECT id,email,name,role FROM users WHERE id=?", (uid,)) as cur:
            row = await cur.fetchone()
    finally:
        await conn.close()
    if not row:
        raise HTTPException(401, "User not found")
    return User(**_row_to_dict(row))

async def current_customer(creds: HTTPAuthorizationCredentials = Depends(security)) -> Customer:
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        if payload.get("typ") != "customer":
            raise HTTPException(401, "Invalid customer token")
        cid = payload["sub"]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid customer token")
    conn = await get_db()
    try:
        async with conn.execute("""
            SELECT id,full_name,account_number,institution,balance
            FROM customer_accounts WHERE id=?
        """, (cid,)) as cur:
            row = await cur.fetchone()
    finally:
        await conn.close()
    if not row:
        raise HTTPException(401, "Customer not found")
    return Customer(**_row_to_dict(row))

# ---------- Seed catalogues ----------
ZW_BANKS = ["CBZ Bank", "Stanbic Bank", "Steward Bank", "ZB Bank", "FBC Bank", "Nedbank ZW"]
ZW_MOBILE = ["EcoCash", "OneMoney", "InnBucks"]
SUPPORTED_INSTITUTIONS = ["EcoCash", "InnBucks", "OneMoney", "CBZ Bank", "ZB Bank", "FBC Bank", "Stanbic Bank", "Nedbank ZW", "Steward Bank"]
FIRST_NAMES = ["Tendai", "Chiedza", "Tafadzwa", "Rumbi", "Farai", "Nyasha", "Kudzai", "Tinashe",
               "Munyaradzi", "Vimbai", "Tatenda", "Shamiso", "Blessing", "Tapiwa", "Ruvimbo",
               "Simbarashe", "Chipo", "Privilege", "Hope", "Anesu"]
LAST_NAMES = ["Moyo", "Ncube", "Sibanda", "Chigumba", "Mukamuri", "Dube", "Mhlanga", "Banda",
              "Chiwenga", "Marufu", "Mutasa", "Zhou", "Madondo", "Chirwa", "Nyathi"]
CLEAN_DESCS = [
    "Salary payment", "Grocery purchase Pick n Pay", "School fees term 1",
    "Rent payment Avondale", "Medical aid premium", "Electricity ZESA token",
    "Insurance premium", "Internet bill ZOL", "Funeral cover", "Family support"
]
SUS_DESCS = [
    "Urgent transfer offshore consultancy",
    "Loan repayment cash settlement immediate",
    "Personal favor wire transfer no questions",
    "Crypto trade urgent settlement",
    "Consultancy fee untraceable cash withdrawal",
    "Quick deposit then split transfers",
    "Smurfing settlement under threshold",
    "Shell company invoice payment offshore",
    "Gift remittance multiple parties large",
]

def gen_account(institution: str, idx: int) -> str:
    if institution in ZW_MOBILE:
        return f"+263{77 + (idx % 3)}{random.randint(1000000, 9999999)}"
    return f"{institution[:3].upper()}-{random.randint(10000000, 99999999)}"

# ---------- Seed data ----------
async def _insert_txs(conn, txs: List[Dict]):
    rows = []
    for t in txs:
        rows.append((
            t["id"], t["timestamp"], t["sender_account"], t["sender_name"], t["sender_institution"],
            t["receiver_account"], t["receiver_name"], t["receiver_institution"],
            t["amount"], t["currency"], t["description"], t["channel"],
            t.get("risk_score", 0.0), t.get("risk_level", "low"), 1 if t.get("flagged") else 0,
            json.dumps(t.get("nlp_keywords", [])),
            json.dumps(t.get("dl_signals", [])),
            json.dumps(t.get("graph_signals", [])),
        ))
    await conn.executemany("""
        INSERT OR REPLACE INTO transactions
        (id,timestamp,sender_account,sender_name,sender_institution,
         receiver_account,receiver_name,receiver_institution,
         amount,currency,description,channel,risk_score,risk_level,flagged,
         nlp_keywords,dl_signals,graph_signals)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, rows)

async def seed_data(force: bool = False):
    conn = await get_db()
    try:
        async with conn.execute("SELECT COUNT(*) as c FROM transactions") as cur:
            count = (await cur.fetchone())["c"]
        if RESET_MARKER.exists() and not force:
            return
        if count > 0 and not force:
            return
        if force and RESET_MARKER.exists():
            RESET_MARKER.unlink()
        await conn.execute("DELETE FROM transactions")
        await conn.execute("DELETE FROM alerts")

        # Try loading from /app/data/transactions.json
        data_file = ROOT_DIR.parent / "data" / "transactions.json"
        if data_file.exists():
            with open(data_file, "r") as f:
                txs = json.load(f)
            for t in txs:
                t.setdefault("risk_score", 0.0)
                t.setdefault("risk_level", "low")
                t.setdefault("flagged", False)
                t.setdefault("nlp_keywords", [])
                t.setdefault("dl_signals", [])
                t.setdefault("graph_signals", [])
            await _insert_txs(conn, txs)
            await conn.commit()
            log.info(f"Loaded {len(txs)} transactions from {data_file}")
            return

        # Programmatic generation fallback
        random.seed(42)
        accounts = []
        for i in range(35):
            inst = random.choice(ZW_BANKS + ZW_MOBILE)
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            accounts.append({"acct": gen_account(inst, i), "name": name, "inst": inst})

        txs: List[Dict] = []
        base = datetime.now(timezone.utc) - timedelta(days=14)

        def add(s, r, amt, desc, ts):
            txs.append({
                "id": str(uuid.uuid4()),
                "timestamp": ts.isoformat(),
                "sender_account": s["acct"], "sender_name": s["name"], "sender_institution": s["inst"],
                "receiver_account": r["acct"], "receiver_name": r["name"], "receiver_institution": r["inst"],
                "amount": round(amt, 2), "currency": "USD", "description": desc,
                "channel": "mobile_money" if (s["inst"] in ZW_MOBILE or r["inst"] in ZW_MOBILE) else "bank",
            })

        for _ in range(120):
            s, r = random.sample(accounts, 2)
            ts = base + timedelta(seconds=random.randint(0, 14 * 86400))
            add(s, r, random.uniform(5, 1500), random.choice(CLEAN_DESCS), ts)
        src = accounts[0]
        smurfs = accounts[1:6]
        t0 = base + timedelta(days=2)
        for i in range(8):
            for sm in smurfs:
                add(src, sm, random.uniform(8500, 9950), random.choice(SUS_DESCS),
                    t0 + timedelta(minutes=i * 30 + random.randint(0, 10)))
        chain = random.sample(accounts[6:20], 5)
        t1 = base + timedelta(days=5)
        amount = 75000.0
        for i in range(len(chain) - 1):
            add(chain[i], chain[i + 1], amount * (0.95 ** i), random.choice(SUS_DESCS),
                t1 + timedelta(minutes=i * 15))
        src2 = accounts[20]
        for r in accounts[21:28]:
            add(src2, r, 10000.0, "Quick deposit then split transfers",
                base + timedelta(days=8, minutes=random.randint(0, 60)))
        txs.sort(key=lambda x: x["timestamp"])
        await _insert_txs(conn, txs)
        await conn.commit()
        log.info(f"Seeded {len(txs)} transactions (programmatic)")
    finally:
        await conn.close()

async def seed_user():
    conn = await get_db()
    try:
        async with conn.execute("SELECT COUNT(*) as c FROM users WHERE email=?", ("officer@rbz.co.zw",)) as cur:
            if (await cur.fetchone())["c"] > 0:
                return
        await conn.execute(
            "INSERT INTO users (id,email,name,role,password) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), "officer@rbz.co.zw", "Tendai Moyo", "Compliance Officer", hash_pw("aml2026"))
        )
        await conn.commit()
        log.info("Seeded compliance officer account")
    finally:
        await conn.close()

DEMO_CUSTOMERS = [
    ("EcoCash Customer", "+263771234567", "EcoCash", 5000),
    ("InnBucks Customer", "+263781234567", "InnBucks", 5000),
    ("OneMoney Customer", "+263711234567", "OneMoney", 5000),
    ("CBZ Customer", "CBZ-10000001", "CBZ Bank", 25000),
    ("ZB Customer", "ZB-10000002", "ZB Bank", 25000),
    ("FBC Customer", "FBC-10000003", "FBC Bank", 25000),
    ("Stanbic Customer", "STAN-10000004", "Stanbic Bank", 25000),
    ("Nedbank ZW Customer", "NED-10000005", "Nedbank ZW", 25000),
    ("Steward Bank Customer", "STEW-10000006", "Steward Bank", 25000),
]

async def seed_customers():
    conn = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        for full_name, account_number, institution, balance in DEMO_CUSTOMERS:
            await conn.execute("""
                INSERT OR IGNORE INTO customer_accounts
                (id,full_name,account_number,institution,balance,password,created_at)
                VALUES (?,?,?,?,?,?,?)
            """, (str(uuid.uuid4()), full_name, account_number, institution, balance, hash_pw("1234"), now))
        await conn.commit()
        log.info("Seeded demo customer accounts")
    finally:
        await conn.close()

# ---------- Detection: DL ----------
def dl_score(tx: Dict, related: List[Dict]) -> Dict:
    signals = []
    score = 0.0
    t = datetime.fromisoformat(tx["timestamp"])
    window = [r for r in related
              if r["sender_account"] == tx["sender_account"]
              and abs((datetime.fromisoformat(r["timestamp"]) - t).total_seconds()) < 86400]
    if len(window) >= 6:
        score += 0.30
        signals.append(f"High velocity: {len(window)} tx in 24h window")
    if 8000 <= tx["amount"] <= 9999:
        score += 0.25
        signals.append("Amount just under USD 10,000 reporting threshold")
    if tx["amount"] >= 5000 and tx["amount"] % 1000 == 0:
        score += 0.10
        signals.append(f"Round-figure transaction USD {tx['amount']:.0f}")
    if tx["amount"] in (10000, 50000):
        score += 0.25
        signals.append(f"High-risk round amount USD {tx['amount']:.0f}")
    if tx["amount"] >= 15000:
        score += 0.35
        signals.append(f"Large transaction at or above USD 15,000 threshold: USD {tx['amount']:.0f}")
    if ((tx["sender_institution"] in ZW_MOBILE) != (tx["receiver_institution"] in ZW_MOBILE)):
        score += 0.10
        signals.append("Cross-channel movement between mobile money and bank")
    receivers = {r["receiver_account"] for r in window}
    if len(receivers) >= 5:
        score += 0.20
        signals.append(f"Fan-out to {len(receivers)} distinct receivers in 24h")
    inbound = [r for r in related
               if r["receiver_account"] == tx["sender_account"]
               and 0 < (t - datetime.fromisoformat(r["timestamp"])).total_seconds() < 3600
               and r["sender_institution"] != tx["receiver_institution"]]
    if inbound:
        score += 0.20
        signals.append("Rapid cross-institution pass-through (<1h)")
    return {"score": min(score, 1.0), "signals": signals}

# ---------- Detection: NLP ----------
SUSPICIOUS_KEYWORDS = [
    "urgent", "offshore", "shell", "smurfing", "untraceable", "split", "structuring",
    "no questions", "consultancy fee", "loan repayment cash", "crypto", "wire transfer",
    "remittance multiple", "settlement immediate", "under threshold"
]

async def nlp_score(description: str, use_llm: bool = True) -> Dict:
    desc_l = description.lower()
    flagged = [k for k in SUSPICIOUS_KEYWORDS if k in desc_l]
    base_score = min(0.15 * len(flagged), 0.7)
    explanation = ""
    if use_llm and EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"aml-{uuid.uuid4()}",
                system_message=("You are an AML analyst. Given a transaction description, "
                                "respond in ONE short sentence (<=25 words) explaining why it "
                                "could indicate money laundering, OR say 'No clear AML indicators.'")
            ).with_model("openai", "gpt-4o-mini")
            resp = await asyncio.wait_for(chat.send_message(UserMessage(text=description)), timeout=8.0)
            explanation = (resp or "").strip()
            if "no clear" not in explanation.lower():
                base_score = max(base_score, 0.4)
        except Exception as e:
            log.warning(f"LLM NLP fallback: {e}")
    return {"score": min(base_score, 1.0), "keywords": flagged, "explanation": explanation}

# ---------- Detection: Graph ----------
def build_graph(txs: List[Dict]) -> nx.DiGraph:
    G = nx.DiGraph()
    for t in txs:
        G.add_node(t["sender_account"], name=t["sender_name"], inst=t["sender_institution"])
        G.add_node(t["receiver_account"], name=t["receiver_name"], inst=t["receiver_institution"])
        if G.has_edge(t["sender_account"], t["receiver_account"]):
            G[t["sender_account"]][t["receiver_account"]]["weight"] += t["amount"]
            G[t["sender_account"]][t["receiver_account"]]["count"] += 1
        else:
            G.add_edge(t["sender_account"], t["receiver_account"], weight=t["amount"], count=1)
    return G

def graph_score(tx: Dict, all_txs: List[Dict]) -> Dict:
    G = build_graph(all_txs)
    signals = []
    score = 0.0
    src, dst = tx["sender_account"], tx["receiver_account"]
    if G.out_degree(src) >= 5:
        score += 0.15
        signals.append(f"Sender fan-out degree {G.out_degree(src)}")
    if G.in_degree(dst) >= 5:
        score += 0.15
        signals.append(f"Receiver fan-in degree {G.in_degree(dst)}")
    try:
        depth = 0
        node = dst
        seen = {src, dst}
        while True:
            outs = [n for n in G.successors(node) if n not in seen]
            if not outs:
                break
            node = outs[0]
            seen.add(node)
            depth += 1
            if depth >= 5:
                break
        if depth >= 3:
            score += 0.30
            signals.append(f"Downstream layering chain depth {depth}")
    except Exception:
        pass
    try:
        if nx.has_path(G, dst, src):
            score += 0.25
            signals.append("Funds cycle detected (receiver routes back to sender)")
    except Exception:
        pass
    return {"score": min(score, 1.0), "signals": signals}

# ---------- Combined analyzer ----------
def _risk_level(s: float) -> str:
    return "high" if s >= 0.65 else ("medium" if s >= 0.35 else "low")

async def analyze_tx(tx: Dict, all_txs: List[Dict], use_llm: bool = True) -> Dict:
    dl = dl_score(tx, all_txs)
    nlp = await nlp_score(tx["description"], use_llm=use_llm)
    gr = graph_score(tx, all_txs)
    combined = round(0.4 * dl["score"] + 0.3 * nlp["score"] + 0.3 * gr["score"], 3)
    if 8000 <= tx["amount"] <= 9999 and nlp["keywords"]:
        combined = max(combined, 0.68)
    if tx["amount"] in (10000, 50000):
        combined = max(combined, 0.40)
    if tx["amount"] >= 15000:
        combined = max(combined, 0.68)
    level = _risk_level(combined)
    return {
        "risk_score": combined, "risk_level": level,
        "flagged": combined >= 0.35,
        "dl": dl, "nlp": nlp, "graph": gr,
    }

def alert_reason(result: Dict) -> str:
    reason_parts = result["dl"]["signals"][:2] + result["graph"]["signals"][:2]
    if result["nlp"]["keywords"]:
        reason_parts.append("NLP flags: " + ", ".join(result["nlp"]["keywords"][:4]))
    return " | ".join(reason_parts) or "Multi-signal suspicious activity"

def readable_reasons(scored: Dict) -> List[str]:
    reasons = []
    reasons.extend(scored.get("dl_signals", []))
    reasons.extend(scored.get("graph_signals", []))
    keywords = scored.get("nlp_keywords", [])
    if keywords:
        reasons.append("Suspicious NLP keywords detected: " + ", ".join(keywords[:6]))
    if not reasons:
        reasons.append("No significant AML indicators detected by the current scoring model")
    return reasons

def infer_channel(sender_institution: str, receiver_institution: str) -> str:
    return "mobile_money" if (sender_institution in ZW_MOBILE or receiver_institution in ZW_MOBILE) else "bank"

async def score_and_persist_tx(conn, tx: Dict, use_llm: bool = False) -> Dict:
    async with conn.execute("SELECT * FROM transactions ORDER BY timestamp ASC") as cur:
        rows = await cur.fetchall()
    all_txs = [_tx_from_row(r) for r in rows]
    result = await analyze_tx(tx, all_txs, use_llm=use_llm)
    await conn.execute("""
        UPDATE transactions
        SET risk_score=?, risk_level=?, flagged=?,
            nlp_keywords=?, dl_signals=?, graph_signals=?
        WHERE id=?
    """, (
        result["risk_score"], result["risk_level"], 1 if result["flagged"] else 0,
        json.dumps(result["nlp"]["keywords"]),
        json.dumps(result["dl"]["signals"]),
        json.dumps(result["graph"]["signals"]),
        tx["id"],
    ))
    if result["flagged"]:
        await conn.execute("""
            INSERT INTO alerts (id,transaction_id,severity,reason,status,created_at,notes)
            VALUES (?,?,?,?,?,?,?)
        """, (
            str(uuid.uuid4()), tx["id"], result["risk_level"], alert_reason(result),
            "open", datetime.now(timezone.utc).isoformat(), None,
        ))
    return {
        **tx,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "flagged": result["flagged"],
        "nlp_keywords": result["nlp"]["keywords"],
        "dl_signals": result["dl"]["signals"],
        "graph_signals": result["graph"]["signals"],
    }

async def run_full_scan(use_llm: bool = False):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions ORDER BY timestamp ASC") as cur:
            rows = await cur.fetchall()
        all_txs = [_tx_from_row(r) for r in rows]
        await conn.execute("DELETE FROM alerts")

        new_alerts = []
        for tx in all_txs:
            result = await analyze_tx(tx, all_txs, use_llm=use_llm)
            await conn.execute("""
                UPDATE transactions
                SET risk_score=?, risk_level=?, flagged=?,
                    nlp_keywords=?, dl_signals=?, graph_signals=?
                WHERE id=?
            """, (
                result["risk_score"], result["risk_level"], 1 if result["flagged"] else 0,
                json.dumps(result["nlp"]["keywords"]),
                json.dumps(result["dl"]["signals"]),
                json.dumps(result["graph"]["signals"]),
                tx["id"],
            ))
            if result["flagged"]:
                new_alerts.append((
                    str(uuid.uuid4()), tx["id"], result["risk_level"],
                    alert_reason(result),
                    "open", datetime.now(timezone.utc).isoformat(), None,
                ))
        if new_alerts:
            await conn.executemany(
                "INSERT INTO alerts (id,transaction_id,severity,reason,status,created_at,notes) VALUES (?,?,?,?,?,?,?)",
                new_alerts
            )
        await conn.commit()
        log.info(f"Scan complete: {len(new_alerts)} alerts generated")
    finally:
        await conn.close()

# ---------- Routes ----------
@api.get("/")
async def root():
    return {"service": "AML Detection Platform", "database": "sqlite", "status": "ok"}

@api.post("/auth/login", response_model=Token)
async def login(body: LoginIn):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM users WHERE email=?", (body.email,)) as cur:
            row = await cur.fetchone()
    finally:
        await conn.close()
    if not row or not check_pw(body.password, row["password"]):
        raise HTTPException(401, "Invalid credentials")
    user = User(id=row["id"], email=row["email"], name=row["name"], role=row["role"])
    return Token(access_token=make_token(user.id), user=user)

@api.get("/auth/me", response_model=User)
async def me(u: User = Depends(current_user)):
    return u

@api.get("/institutions")
async def institutions():
    return [
        {"name": name, "type": "Mobile Money" if name in ZW_MOBILE else "Bank"}
        for name in SUPPORTED_INSTITUTIONS
    ]

@api.post("/customer/login", response_model=CustomerToken)
async def customer_login(body: CustomerLoginIn):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM customer_accounts WHERE institution=? AND account_number=?",
                                (body.institution, body.account_number)) as cur:
            row = await cur.fetchone()
    finally:
        await conn.close()
    if not row or not check_pw(body.pin, row["password"]):
        raise HTTPException(401, "Invalid customer credentials")
    customer = Customer(
        id=row["id"],
        full_name=row["full_name"],
        account_number=row["account_number"],
        institution=row["institution"],
        balance=row["balance"],
    )
    return CustomerToken(access_token=make_token(customer.id, "customer"), customer=customer)

@api.get("/customer/me", response_model=Customer)
async def customer_me(customer: Customer = Depends(current_customer)):
    return customer

@api.get("/customer/transactions", response_model=List[Transaction])
async def customer_transactions(customer: Customer = Depends(current_customer)):
    conn = await get_db()
    try:
        async with conn.execute("""
            SELECT * FROM transactions
            WHERE sender_account=? OR receiver_account=?
            ORDER BY timestamp DESC
            LIMIT 200
        """, (customer.account_number, customer.account_number)) as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    return [Transaction(**_tx_from_row(r)) for r in rows]

@api.post("/customer/transactions", response_model=Transaction)
async def create_customer_transaction(body: CustomerTransactionIn, customer: Customer = Depends(current_customer)):
    if body.receiver_institution not in SUPPORTED_INSTITUTIONS:
        raise HTTPException(400, "Unsupported receiver institution")
    tx = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sender_account": customer.account_number,
        "sender_name": customer.full_name,
        "sender_institution": customer.institution,
        "receiver_account": body.receiver_account,
        "receiver_name": body.receiver_name,
        "receiver_institution": body.receiver_institution,
        "amount": round(body.amount, 2),
        "currency": body.currency.upper(),
        "description": body.description.strip(),
        "channel": infer_channel(customer.institution, body.receiver_institution),
        "risk_score": 0.0,
        "risk_level": "low",
        "flagged": False,
        "nlp_keywords": [],
        "dl_signals": [],
        "graph_signals": [],
    }
    conn = await get_db()
    try:
        await _insert_txs(conn, [tx])
        await conn.execute(
            "UPDATE customer_accounts SET balance = balance - ? WHERE id=?",
            (tx["amount"], customer.id),
        )
        scored = await score_and_persist_tx(conn, tx, use_llm=False)
        await conn.commit()
    finally:
        await conn.close()
    return Transaction(**scored)

@api.post("/data/seed")
async def seed_endpoint(u: User = Depends(current_user)):
    await seed_data(force=True)
    await run_full_scan()
    return {"status": "seeded"}

@api.post("/data/reset-transactions")
async def reset_transactions(u: User = Depends(current_user)):
    conn = await get_db()
    try:
        await conn.execute("DELETE FROM transactions")
        await conn.execute("DELETE FROM alerts")
        await conn.execute("DELETE FROM sars")
        await conn.commit()
        RESET_MARKER.touch()
    finally:
        await conn.close()
    return {"status": "reset", "transactions": 0, "alerts": 0, "sars": 0}

@api.post("/simulator/transactions")
async def simulate_transaction(body: SimulatorTransactionIn, u: User = Depends(current_user)):
    sender_institution = body.sender_institution.strip()
    receiver_institution = body.receiver_institution.strip()
    sender_account = body.sender_account.strip()
    receiver_account = body.receiver_account.strip()
    sender_name = body.sender_name.strip()
    receiver_name = body.receiver_name.strip()
    description = body.description.strip()

    if sender_institution not in SUPPORTED_INSTITUTIONS:
        raise HTTPException(400, "Unsupported sender institution")
    if receiver_institution not in SUPPORTED_INSTITUTIONS:
        raise HTTPException(400, "Unsupported receiver institution")
    if not sender_account:
        raise HTTPException(400, "Sender account number is required")
    if not receiver_account:
        raise HTTPException(400, "Receiver account number is required")
    if not sender_name:
        raise HTTPException(400, "Sender name is required")
    if not receiver_name:
        raise HTTPException(400, "Receiver name is required")
    if not description:
        raise HTTPException(400, "Transaction description is required")

    tx = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sender_account": sender_account,
        "sender_name": sender_name,
        "sender_institution": sender_institution,
        "receiver_account": receiver_account,
        "receiver_name": receiver_name,
        "receiver_institution": receiver_institution,
        "amount": round(body.amount, 2),
        "currency": body.currency.strip().upper() or "USD",
        "description": description,
        "channel": infer_channel(sender_institution, receiver_institution),
        "risk_score": 0.0,
        "risk_level": "low",
        "flagged": False,
        "nlp_keywords": [],
        "dl_signals": [],
        "graph_signals": [],
    }

    conn = await get_db()
    try:
        await _insert_txs(conn, [tx])
        scored = await score_and_persist_tx(conn, tx, use_llm=False)
        await conn.commit()
    finally:
        await conn.close()

    return {
        "transaction": Transaction(**scored),
        "explanation": {
            "summary": alert_reason({
                "dl": {"signals": scored["dl_signals"]},
                "graph": {"signals": scored["graph_signals"]},
                "nlp": {"keywords": scored["nlp_keywords"]},
            }) if scored["flagged"] else "Transaction scored and stored for monitoring",
            "reasons": readable_reasons(scored),
        },
    }

@api.get("/transactions", response_model=List[Transaction])
async def list_txs(
    risk_level: Optional[str] = None,
    institution: Optional[str] = None,
    channel: Optional[str] = None,
    flagged_only: bool = False,
    limit: int = 200,
    u: User = Depends(current_user),
):
    sql = "SELECT * FROM transactions WHERE 1=1"
    params: List[Any] = []
    if risk_level:
        sql += " AND risk_level=?"
        params.append(risk_level)
    if channel:
        sql += " AND channel=?"
        params.append(channel)
    if flagged_only:
        sql += " AND flagged=1"
    if institution:
        sql += " AND (sender_institution=? OR receiver_institution=?)"
        params.extend([institution, institution])
    sql += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    conn = await get_db()
    try:
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    return [Transaction(**_tx_from_row(r)) for r in rows]

@api.get("/transactions/{tx_id}")
async def get_tx(tx_id: str, u: User = Depends(current_user)):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        async with conn.execute("SELECT * FROM transactions") as cur:
            all_rows = await cur.fetchall()
    finally:
        await conn.close()
    tx = _tx_from_row(row)
    all_txs = [_tx_from_row(r) for r in all_rows]
    analysis = await analyze_tx(tx, all_txs)
    return {"transaction": tx, "analysis": analysis}

@api.get("/alerts", response_model=List[Alert])
async def list_alerts(status: Optional[str] = None, u: User = Depends(current_user)):
    sql = "SELECT * FROM alerts"
    params: List[Any] = []
    if status:
        sql += " WHERE status=?"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT 500"
    conn = await get_db()
    try:
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    return [Alert(**_row_to_dict(r)) for r in rows]

@api.get("/admin/live-feed", response_model=List[Transaction])
async def live_feed(u: User = Depends(current_user)):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 20") as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    return [Transaction(**_tx_from_row(r)) for r in rows]

@api.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, body: AlertStatusUpdate, u: User = Depends(current_user)):
    conn = await get_db()
    try:
        cur = await conn.execute("UPDATE alerts SET status=?, notes=? WHERE id=?",
                                 (body.status, body.notes, alert_id))
        await conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Alert not found")
    finally:
        await conn.close()
    return {"status": "updated"}

@api.get("/dashboard/stats")
async def stats(u: User = Depends(current_user)):
    conn = await get_db()
    try:
        async def scalar(sql, params=()):
            async with conn.execute(sql, params) as cur:
                row = await cur.fetchone()
                return list(row)[0] if row else 0

        total_tx = await scalar("SELECT COUNT(*) FROM transactions")
        total_flagged = await scalar("SELECT COUNT(*) FROM transactions WHERE flagged=1")
        high = await scalar("SELECT COUNT(*) FROM transactions WHERE risk_level='high'")
        medium = await scalar("SELECT COUNT(*) FROM transactions WHERE risk_level='medium'")
        low = await scalar("SELECT COUNT(*) FROM transactions WHERE risk_level='low'")
        open_alerts = await scalar("SELECT COUNT(*) FROM alerts WHERE status='open'")
        sars_count = await scalar("SELECT COUNT(*) FROM sars")

        async with conn.execute("""
            SELECT sender_institution as institution, COUNT(*) as count,
                   SUM(CASE WHEN flagged=1 THEN 1 ELSE 0 END) as flagged
            FROM transactions
            GROUP BY sender_institution
        """) as cur:
            inst_rows = await cur.fetchall()
        by_institution = [{"institution": r["institution"], "count": r["count"], "flagged": r["flagged"]} for r in inst_rows]

        async with conn.execute("""
            SELECT substr(timestamp, 1, 10) as day,
                   SUM(amount) as volume,
                   COUNT(*) as tx_count,
                   SUM(CASE WHEN flagged=1 THEN 1 ELSE 0 END) as flagged_count
            FROM transactions
            GROUP BY day
            ORDER BY day ASC
        """) as cur:
            ts_rows = await cur.fetchall()
        timeseries = [{"day": r["day"], "volume": round(r["volume"] or 0, 2),
                       "tx_count": r["tx_count"], "flagged_count": r["flagged_count"]} for r in ts_rows]

        return {
            "total_tx": total_tx, "total_flagged": total_flagged,
            "high": high, "medium": medium, "low": low,
            "open_alerts": open_alerts, "sars": sars_count,
            "by_institution": by_institution, "timeseries": timeseries,
        }
    finally:
        await conn.close()


# ---------- Investigation workspace ----------
def _pattern_type(tx: Dict) -> str:
    desc = (tx.get("description") or "").lower()
    amount = float(tx.get("amount") or 0)
    if "structur" in desc or 8000 <= amount < 10000:
        return "Structuring"
    if any(k in desc for k in ["rapid", "immediate", "split"]):
        return "Rapid movement"
    if any(k in desc for k in ["round", "return", "reversal"]):
        return "Round-tripping"
    if any(k in desc for k in ["mule", "third party", "cash pickup"]):
        return "Mule account"
    if amount >= 15000:
        return "High-value transfer"
    if any(k in desc for k in ["offshore", "shell", "crypto", "layer"]):
        return "Layering"
    return "Normal activity"

def _account_type(name: str, institution: str) -> str:
    n = (name or "").lower()
    if any(k in n for k in ["holdings", "pvt", "ltd", "services", "minerals", "trading", "investments", "broker", "college", "manufacturing"]):
        return "Business/Merchant"
    if institution in ZW_BANKS + ZW_MOBILE:
        return "Individual/Customer"
    return "Institution"

def _tx_reason(tx: Dict) -> str:
    signals = []
    signals.extend(tx.get("dl_signals") or [])
    signals.extend(tx.get("graph_signals") or [])
    kws = tx.get("nlp_keywords") or []
    if kws:
        signals.append("NLP flags: " + ", ".join(kws[:5]))
    if signals:
        return " | ".join(signals[:3])
    pattern = _pattern_type(tx)
    if pattern != "Normal activity":
        return f"{pattern} indicator based on amount, channel, or description."
    return "No strong suspicious indicator recorded."

def _recommendation(tx: Dict) -> str:
    level = tx.get("risk_level", "low")
    pattern = _pattern_type(tx)
    if level == "high":
        return f"Review the {pattern.lower()} chain and consider SAR generation."
    if level == "medium":
        return "Monitor account activity and request supporting transaction context."
    return "No immediate escalation required; retain for monitoring."

def _matches_investigation_filters(tx: Dict, risk_level=None, institution=None, min_amount=None, date_from=None, date_to=None, pattern_type=None, suspicious_only=False, channel=None, min_risk_score=None) -> bool:
    if risk_level and tx.get("risk_level") != risk_level:
        return False
    if institution and institution not in (tx.get("sender_institution"), tx.get("receiver_institution")):
        return False
    if channel and channel not in (tx.get("sender_institution"), tx.get("receiver_institution"), tx.get("channel")):
        return False
    if min_amount is not None and float(tx.get("amount") or 0) < float(min_amount):
        return False
    if min_risk_score is not None and float(tx.get("risk_score") or 0) < float(min_risk_score):
        return False
    if suspicious_only and not tx.get("flagged"):
        return False
    if pattern_type and _pattern_type(tx).lower() != pattern_type.lower():
        return False
    ts = tx.get("timestamp", "")[:10]
    if date_from and ts < date_from:
        return False
    if date_to and ts > date_to:
        return False
    return True

async def _investigation_transactions(**filters) -> List[Dict]:
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions ORDER BY timestamp ASC") as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    txs = [_tx_from_row(r) for r in rows]
    return [t for t in txs if _matches_investigation_filters(t, **filters)]

def _build_investigation_graph(txs: List[Dict]) -> Dict:
    accounts: Dict[str, Dict] = {}
    edge_map: Dict[str, Dict] = {}
    for tx in txs:
        for side in ("sender", "receiver"):
            acct = tx[f"{side}_account"]
            name = tx[f"{side}_name"]
            inst = tx[f"{side}_institution"]
            node = accounts.setdefault(acct, {
                "id": acct, "name": name, "institution": inst, "account_type": _account_type(name, inst),
                "risk": "low", "risk_score": 0.0, "volume": 0.0, "sent": 0.0, "received": 0.0,
                "tx_count": 0, "suspicious_count": 0, "connections": set(), "last_transaction": tx["timestamp"],
            })
            node["volume"] += float(tx.get("amount") or 0)
            node["tx_count"] += 1
            node["suspicious_count"] += 1 if tx.get("flagged") else 0
            node["risk_score"] = max(node["risk_score"], float(tx.get("risk_score") or 0))
            node["risk"] = _risk_level(max(float(tx.get("risk_score") or 0), node["risk_score"]))
            node["last_transaction"] = max(node["last_transaction"], tx["timestamp"])
        accounts[tx["sender_account"]]["sent"] += float(tx.get("amount") or 0)
        accounts[tx["receiver_account"]]["received"] += float(tx.get("amount") or 0)
        accounts[tx["sender_account"]]["connections"].add(tx["receiver_account"])
        accounts[tx["receiver_account"]]["connections"].add(tx["sender_account"])
        key = f'{tx["sender_account"]}->{tx["receiver_account"]}'
        e = edge_map.setdefault(key, {
            "id": key, "source": tx["sender_account"], "target": tx["receiver_account"], "amount": 0.0,
            "count": 0, "risk": "low", "risk_score": 0.0, "transactions": [], "pattern": _pattern_type(tx),
            "reason": _tx_reason(tx), "recommendation": _recommendation(tx), "channel": tx.get("channel", ""),
        })
        e["amount"] += float(tx.get("amount") or 0)
        e["count"] += 1
        e["risk_score"] = max(e["risk_score"], float(tx.get("risk_score") or 0))
        e["risk"] = _risk_level(e["risk_score"])
        e["transactions"].append(tx["id"])
        if tx.get("risk_level") == "high":
            e["pattern"] = _pattern_type(tx)
            e["reason"] = _tx_reason(tx)
            e["recommendation"] = _recommendation(tx)
    nodes = []
    for node in accounts.values():
        node = dict(node)
        node["connections"] = sorted(node["connections"])
        node["connection_count"] = len(node["connections"])
        node["investigation_status"] = "Needs review" if node["suspicious_count"] else "Monitoring"
        node["size"] = max(7, min(24, 7 + node["connection_count"] * 2 + node["risk_score"] * 10 + min(node["volume"] / 25000, 6)))
        nodes.append(node)
    return {"nodes": nodes, "links": list(edge_map.values())}

@api.get("/investigation/graph")
async def investigation_graph(
    risk_level: Optional[str] = None,
    institution: Optional[str] = None,
    min_amount: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pattern_type: Optional[str] = None,
    suspicious_only: bool = False,
    channel: Optional[str] = None,
    min_risk_score: Optional[float] = None,
    account_id: Optional[str] = None,
    connected_only: bool = False,
    u: User = Depends(current_user),
):
    txs = await _investigation_transactions(risk_level=risk_level, institution=institution, min_amount=min_amount, date_from=date_from, date_to=date_to, pattern_type=pattern_type, suspicious_only=suspicious_only, channel=channel, min_risk_score=min_risk_score)
    if connected_only and account_id:
        txs = [t for t in txs if t["sender_account"] == account_id or t["receiver_account"] == account_id]
    return _build_investigation_graph(txs)

@api.get("/investigation/metrics")
async def investigation_metrics(
    risk_level: Optional[str] = None,
    institution: Optional[str] = None,
    min_amount: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pattern_type: Optional[str] = None,
    suspicious_only: bool = False,
    channel: Optional[str] = None,
    min_risk_score: Optional[float] = None,
    u: User = Depends(current_user),
):
    txs = await _investigation_transactions(risk_level=risk_level, institution=institution, min_amount=min_amount, date_from=date_from, date_to=date_to, pattern_type=pattern_type, suspicious_only=suspicious_only, channel=channel, min_risk_score=min_risk_score)
    graph = _build_investigation_graph(txs)
    suspicious = [t for t in txs if t.get("flagged")]
    high_accounts = [n for n in graph["nodes"] if n["risk"] == "high"]
    return {
        "total_accounts": len(graph["nodes"]),
        "total_transactions": len(txs),
        "suspicious_transactions": len(suspicious),
        "high_risk_accounts": len(high_accounts),
        "total_amount_flagged": round(sum(float(t.get("amount") or 0) for t in suspicious), 2),
        "average_risk_score": round((sum(float(t.get("risk_score") or 0) for t in txs) / len(txs)) if txs else 0, 3),
        "sar_candidates": len([t for t in txs if t.get("risk_level") == "high" or float(t.get("risk_score") or 0) >= 0.65]),
        "institutions_involved": len(set([t["sender_institution"] for t in txs] + [t["receiver_institution"] for t in txs])),
    }

@api.get("/investigation/account/{account_id}")
async def investigation_account(account_id: str, u: User = Depends(current_user)):
    txs = await _investigation_transactions()
    graph = _build_investigation_graph([t for t in txs if t["sender_account"] == account_id or t["receiver_account"] == account_id])
    node = next((n for n in graph["nodes"] if n["id"] == account_id), None)
    if not node:
        raise HTTPException(404, "Account not found")
    node["masked_account_id"] = account_id[:4] + "..." + account_id[-4:] if len(account_id) > 8 else account_id
    return node

@api.get("/investigation/transaction/{transaction_id}")
async def investigation_transaction(transaction_id: str, u: User = Depends(current_user)):
    txs = await _investigation_transactions()
    tx = next((t for t in txs if t["id"] == transaction_id), None)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    return {
        **tx,
        "pattern": _pattern_type(tx),
        "reason": _tx_reason(tx),
        "recommendation": _recommendation(tx),
    }

@api.get("/investigation/patterns")
async def investigation_patterns(
    risk_level: Optional[str] = None,
    institution: Optional[str] = None,
    min_amount: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pattern_type: Optional[str] = None,
    suspicious_only: bool = False,
    channel: Optional[str] = None,
    min_risk_score: Optional[float] = None,
    u: User = Depends(current_user),
):
    txs = await _investigation_transactions(risk_level=risk_level, institution=institution, min_amount=min_amount, date_from=date_from, date_to=date_to, pattern_type=pattern_type, suspicious_only=suspicious_only, channel=channel, min_risk_score=min_risk_score)
    groups: Dict[str, List[Dict]] = {}
    for tx in txs:
        p = _pattern_type(tx)
        if p != "Normal activity":
            groups.setdefault(p, []).append(tx)
    cards = []
    for p, rows in groups.items():
        accounts = sorted(set([r["sender_name"] for r in rows] + [r["receiver_name"] for r in rows]))[:6]
        max_score = max(float(r.get("risk_score") or 0) for r in rows)
        cards.append({
            "pattern": p,
            "risk_level": _risk_level(max_score),
            "accounts_involved": accounts,
            "total_amount": round(sum(float(r.get("amount") or 0) for r in rows), 2),
            "transaction_count": len(rows),
            "explanation": f"{p} indicators found across {len(rows)} transactions involving {len(accounts)} visible parties.",
            "recommended_action": "Generate SAR and review source of funds." if max_score >= 0.65 else "Continue enhanced monitoring and request supporting context.",
        })
    return sorted(cards, key=lambda c: (c["risk_level"] != "high", -c["total_amount"]))

@api.get("/investigation/timeline")
async def investigation_timeline(account_id: Optional[str] = None, suspicious_only: bool = False, u: User = Depends(current_user)):
    txs = await _investigation_transactions(suspicious_only=suspicious_only)
    if account_id:
        txs = [t for t in txs if t["sender_account"] == account_id or t["receiver_account"] == account_id]
    return [{
        "id": t["id"], "timestamp": t["timestamp"], "sender": t["sender_name"], "receiver": t["receiver_name"],
        "amount": t["amount"], "institution": f'{t["sender_institution"]} -> {t["receiver_institution"]}',
        "channel": t.get("channel", ""), "risk_level": t.get("risk_level", "low"), "reason": _tx_reason(t),
    } for t in sorted(txs, key=lambda r: r["timestamp"], reverse=True)[:100]]
@api.get("/graph/network")
async def graph_network(account: Optional[str] = None, depth: int = 2, u: User = Depends(current_user)):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions") as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    txs = [_tx_from_row(r) for r in rows]
    G = build_graph(txs)
    if account and account in G.nodes:
        nodes = {account}
        frontier = {account}
        for _ in range(depth):
            nxt = set()
            for n in frontier:
                nxt |= set(G.successors(n)) | set(G.predecessors(n))
            nodes |= nxt
            frontier = nxt
        H = G.subgraph(nodes).copy()
    else:
        flagged_txs = [t for t in txs if t.get("flagged")]
        nodes = set()
        for t in flagged_txs[:100]:
            nodes.add(t["sender_account"])
            nodes.add(t["receiver_account"])
        H = G.subgraph(nodes).copy() if nodes else G

    risk_map = {t["sender_account"]: t.get("risk_level") for t in txs}
    risk_map.update({t["receiver_account"]: t.get("risk_level") for t in txs})
    return {
        "nodes": [{"id": n, "name": H.nodes[n].get("name", n),
                   "institution": H.nodes[n].get("inst", ""),
                   "risk": risk_map.get(n, "low")} for n in H.nodes],
        "links": [{"source": s, "target": t,
                   "weight": round(H.edges[s, t].get("weight", 0), 2),
                   "count": H.edges[s, t].get("count", 1)} for s, t in H.edges],
    }

@api.get("/sars", response_model=List[SAR])
async def list_sars(u: User = Depends(current_user)):
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM sars ORDER BY created_at DESC LIMIT 200") as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    out = []
    for r in rows:
        d = _row_to_dict(r)
        d["transaction_ids"] = json.loads(d["transaction_ids"]) if d.get("transaction_ids") else []
        out.append(SAR(**d))
    return out

@api.post("/sars", response_model=SAR)
async def create_sar(body: CreateSARIn, u: User = Depends(current_user)):
    sar = {
        "id": str(uuid.uuid4()),
        "transaction_ids": body.transaction_ids,
        "primary_subject": body.primary_subject,
        "summary": body.summary,
        "risk_assessment": body.risk_assessment,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": u.name,
        "reference_no": f"SAR-ZW-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{random.randint(1000, 9999)}",
    }
    conn = await get_db()
    try:
        await conn.execute("""
            INSERT INTO sars (id,transaction_ids,primary_subject,summary,risk_assessment,created_at,created_by,reference_no)
            VALUES (?,?,?,?,?,?,?,?)
        """, (sar["id"], json.dumps(sar["transaction_ids"]), sar["primary_subject"],
              sar["summary"], sar["risk_assessment"], sar["created_at"],
              sar["created_by"], sar["reference_no"]))
        await conn.commit()
    finally:
        await conn.close()
    return SAR(**sar)

@api.post("/scan/run")
async def run_scan(u: User = Depends(current_user)):
    await run_full_scan()
    return {"status": "scan_complete"}

@api.get("/export/transactions.csv")
async def export_csv(u: User = Depends(current_user)):
    import csv as _csv
    from io import StringIO
    conn = await get_db()
    try:
        async with conn.execute("SELECT * FROM transactions ORDER BY timestamp DESC") as cur:
            rows = await cur.fetchall()
    finally:
        await conn.close()
    docs = [_tx_from_row(r) for r in rows]
    buf = StringIO()
    if docs:
        fields = ["id", "timestamp", "sender_account", "sender_name", "sender_institution",
                  "receiver_account", "receiver_name", "receiver_institution",
                  "amount", "currency", "description", "channel",
                  "risk_score", "risk_level", "flagged",
                  "nlp_keywords", "dl_signals", "graph_signals"]
        w = _csv.DictWriter(buf, fieldnames=fields)
        w.writeheader()
        for d in docs:
            row = {k: d.get(k, "") for k in fields}
            for lk in ("nlp_keywords", "dl_signals", "graph_signals"):
                if isinstance(row[lk], list):
                    row[lk] = "; ".join(str(x) for x in row[lk])
            w.writerow(row)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=aml_transactions.csv"},
    )

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_schema()
    await seed_user()
    await seed_customers()
    await seed_data()
    conn = await get_db()
    try:
        async with conn.execute("SELECT COUNT(*) as c FROM transactions WHERE flagged=1") as cur:
            cnt = (await cur.fetchone())["c"]
    finally:
        await conn.close()
    if cnt == 0:
        await run_full_scan()

@app.on_event("shutdown")
async def shutdown():
    pass
