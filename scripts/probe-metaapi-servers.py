#!/usr/bin/env python3
"""
Try to discover the correct MetaApi client/manager domain by hitting the
servers endpoint on the API domain that DOES respond (mt-provisioning-api-v1).
Note: with the new token, even GET /users/current/servers/mt-client-api returns 401.
But maybe /users/current/servers without specific path works.
"""
import ssl, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTAyMjMsImV4cCI6MTc5MjY4NjIyM30.aa5bZ8ZJAPT_SHQFs6QRyP3QoFIzxGKLgyP1fdYGh1m2UuT_hHOd2Zmg-Xzy81HQI-do4JWWAB9fEU6jpM14BQrePLowIDXFOKZvpdPJM5UDVTp_cagDOp2nAIxme_ML9Hwn9JIMzX-FG_ZSiqSglyqq-A8EHXjdZBup3YFPKHNndEKrgVuw6P_61Q4CbeOcofHLey-XUhfn8DzVHBSv-PlOV6oVgKvKm5Gib2bKquDF7UF1HBeolVBKd6PiSuPLqjKg_AkOioziSpai_PbyzTs8WOk4ZYhxCPG8xi3cOLKG8i_6zSD2lx6JGZzuNdu4lD6jLhawBDVancbCP9_6SO6YmxgNH2ovMuan7uFpoeqhCDCRbjj45x3bdjRJZtvgfzK2EPhFiqe1w6PEZvaB5jFy8qge8M7JxLTAIi-Xi4lEcZJgGcnkdBMhMqleYy5P97GHpgmWShMm14VFHi2Ck5tXQclGFP9n3Uo5OWkczbUCXAtMMpJ-Z4XCr0cl0koSm86wNhb1kiTSC6ceLW9e_ra3C5uIoyFY4AquP--vCb1qRiwmR_Qm6N5nwd4BbluU83SZ0P65MmGgtSd40dGeaFBcN_CsqLtevlgDzgjp0TE1TPkP2SXXLNwp57q6_JIZ04NYPieP7IyGAzJW0L9vycyU8HzbMvXpPMQLc0JuT5o"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(url, label, method="GET", data=None):
    print(f"\n--- {label} ---")
    print(f"{method} {url}")
    headers = {"auth-token": TOKEN}
    if data:
        headers["Content-Type"] = "application/json"
    req = Request(url, headers=headers, data=data, method=method)
    try:
        with urlopen(req, context=ctx, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"HTTP {resp.status}")
            print(f"body[:600]: {body[:600]}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}")
        print(f"body[:400]: {body[:400]}")
    except Exception as e:
        print(f"Error: {e}")

# Try various MetaApi hostnames that might have the provisioning endpoint
hosts = [
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai",  # known — returns 401
    "https://api.metaapi.cloud",                                     # official new domain
    "https://metaapi.cloud",                                         # bare
    "https://mt-provisioning-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai",  # try region-specific
]

for h in hosts:
    probe(f"{h}/users/current/accounts", f"PROBE {h}")

# Try trading account management API (which we DO have access to)
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/trading-accounts",
    "TRADING ACCOUNT MANAGEMENT API: /users/current/trading-accounts",
)

# Try POST create — sometimes POST endpoints work even when GET is blocked
import json as _json
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    "POST PROVISIONING (try create)",
    method="POST",
    data=_json.dumps({
        "login": "474240052",
        "password": "test",
        "server": "Exness-MT5Trial15",
        "name": "PROBE-DELETE-ME",
        "type": "cloud-g2",
        "platform": "mt5",
    }).encode("utf-8"),
)
