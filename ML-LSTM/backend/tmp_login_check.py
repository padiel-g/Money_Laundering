import requests

url = "http://localhost:8001/api/auth/login"
payload = {"email": "officer@rbz.co.zw", "password": "aml2026"}

r = requests.post(url, json=payload, timeout=20)
print("status", r.status_code)
print("content-type", r.headers.get("content-type"))
text = r.text or ""
print("body_len", len(text))
# print first ~500 chars without using Python slice syntax that breaks some shells
head = "".join(text[i] for i in range(0, min(500, len(text))))
print("body_head", head)
