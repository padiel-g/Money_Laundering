"""AML platform backend regression tests."""
import os, requests, pytest, time

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://aml-detect-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
CREDS = {"email": "officer@rbz.co.zw", "password": "aml2026"}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json=CREDS, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}"}


def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200

def test_login_bad():
    r = requests.post(f"{API}/auth/login", json={"email": "officer@rbz.co.zw", "password": "wrong"}, timeout=15)
    assert r.status_code == 401

def test_login_ok(token):
    assert isinstance(token, str) and len(token) > 10

def test_me(H):
    r = requests.get(f"{API}/auth/me", headers=H, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == CREDS["email"]

def test_stats(H):
    r = requests.get(f"{API}/dashboard/stats", headers=H, timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_tx","total_flagged","high","medium","low","open_alerts","sars","by_institution","timeseries"]:
        assert k in d, f"missing {k}"
    assert d["total_tx"] > 0

def test_transactions_list(H):
    r = requests.get(f"{API}/transactions", headers=H, timeout=30)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) > 0
    t = arr[0]
    for k in ["id","risk_score","risk_level","nlp_keywords","dl_signals","graph_signals"]:
        assert k in t

def test_transactions_filter(H):
    r = requests.get(f"{API}/transactions", params={"flagged_only": "true", "risk_level": "high"}, headers=H, timeout=30)
    assert r.status_code == 200
    for t in r.json():
        assert t["flagged"] is True
        assert t["risk_level"] == "high"

def test_tx_detail(H):
    arr = requests.get(f"{API}/transactions", params={"limit": 1}, headers=H, timeout=30).json()
    tid = arr[0]["id"]
    r = requests.get(f"{API}/transactions/{tid}", headers=H, timeout=60)
    assert r.status_code == 200
    j = r.json()
    assert "transaction" in j and "analysis" in j
    for k in ["dl","nlp","graph","risk_score","risk_level"]:
        assert k in j["analysis"]

def test_alerts_and_patch(H):
    r = requests.get(f"{API}/alerts", headers=H, timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    if arr:
        aid = arr[0]["id"]
        u = requests.patch(f"{API}/alerts/{aid}", json={"status": "under_review", "notes": "TEST_review"}, headers=H, timeout=15)
        assert u.status_code == 200
        again = requests.get(f"{API}/alerts", params={"status": "under_review"}, headers=H, timeout=15).json()
        assert any(a["id"] == aid for a in again)

def test_graph_network(H):
    r = requests.get(f"{API}/graph/network", headers=H, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "nodes" in j and "links" in j
    if j["nodes"]:
        acct = j["nodes"][0]["id"]
        r2 = requests.get(f"{API}/graph/network", params={"account": acct}, headers=H, timeout=30)
        assert r2.status_code == 200

def test_sar_create_and_list(H):
    txs = requests.get(f"{API}/transactions", params={"flagged_only": "true", "limit": 1}, headers=H, timeout=15).json()
    if not txs:
        pytest.skip("No flagged tx to file SAR for")
    payload = {"transaction_ids": [txs[0]["id"]], "primary_subject": "TEST_subject", "summary": "TEST summary", "risk_assessment": "high"}
    r = requests.post(f"{API}/sars", json=payload, headers=H, timeout=15)
    assert r.status_code == 200
    sar = r.json()
    assert sar["reference_no"].startswith("SAR-ZW-")
    lst = requests.get(f"{API}/sars", headers=H, timeout=15).json()
    assert any(s["id"] == sar["id"] for s in lst)

def test_scan_run(H):
    r = requests.post(f"{API}/scan/run", headers=H, timeout=120)
    assert r.status_code == 200

def test_unauthorized():
    r = requests.get(f"{API}/dashboard/stats", timeout=10)
    assert r.status_code in (401, 403)

def test_root_db_sqlite():
    r = requests.get(f"{API}/", timeout=15).json()
    assert r.get("database") == "sqlite"

def test_export_csv_171_rows(H):
    r = requests.get(f"{API}/export/transactions.csv", headers=H, timeout=30)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    body = r.text
    lines = [l for l in body.splitlines() if l.strip()]
    # header + 171 rows
    assert len(lines) >= 172, f"expected >=172 lines incl header, got {len(lines)}"

def test_list_fields_are_arrays(H):
    arr = requests.get(f"{API}/transactions", params={"flagged_only": "true", "limit": 5}, headers=H, timeout=30).json()
    assert arr, "no flagged tx"
    for t in arr:
        for k in ("nlp_keywords", "dl_signals", "graph_signals"):
            assert isinstance(t[k], list), f"{k} should be a list, got {type(t[k]).__name__}"

def test_sar_transaction_ids_are_list(H):
    txs = requests.get(f"{API}/transactions", params={"flagged_only": "true", "limit": 1}, headers=H, timeout=15).json()
    if not txs:
        pytest.skip("no flagged tx")
    payload = {"transaction_ids": [txs[0]["id"]], "primary_subject": "TEST_arr", "summary": "TEST", "risk_assessment": "high"}
    sar = requests.post(f"{API}/sars", json=payload, headers=H, timeout=15).json()
    assert isinstance(sar["transaction_ids"], list)
    lst = requests.get(f"{API}/sars", headers=H, timeout=15).json()
    found = next((s for s in lst if s["id"] == sar["id"]), None)
    assert found and isinstance(found["transaction_ids"], list)
