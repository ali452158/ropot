#!/usr/bin/env python3
"""Inspect the new token provided by the user."""
import json, base64, sys, datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import ssl

NEW_TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTAyMjMsImV4cCI6MTc5MjY4NjIyM30.aa5bZ8ZJAPT_SHQFs6QRyP3QoFIzxGKLgyP1fdYGh1m2UuT_hHOd2Zmg-Xzy81HQI-do4JWWAB9fEU6jpM14BQrePLowIDXFOKZvpdPJM5UDVTp_cagDOp2nAIxme_ML9Hwn9JIMzX-FG_ZSiqSglyqq-A8EHXjdZBup3YFPKHNndEKrgVuw6P_61Q4CbeOcofHLey-XUhfn8DzVHBSv-PlOV6oVgKvKm5Gib2bKquDF7UF1HBeolVBKd6PiSuPLqjKg_AkOioziSpai_PbyzTs8WOk4ZYhxCPG8xi3cOLKG8i_6zSD2lx6JGZzuNdu4lD6jLhawBDVancbCP9_6SO6YmxgNH2ovMuan7uFpoeqhCDCRbjj45x3bdjRJZtvgfzK2EPhFiqe1w6PEZvaB5jFy8qge8M7JxLTAIi-Xi4lEcZJgGcnkdBMhMqleYy5P97GHpgmWShMm14VFHi2Ck5tXQclGFP9n3Uo5OWkczbUCXAtMMpJ-Z4XCr0cl0koSm86wNhb1kiTSC6ceLW9e_ra3C5uIoyFY4AquP--vCb1qRiwmR_Qm6N5nwd4BbluU83SZ0P65MmGgtSd40dGeaFBcN_CsqLtevlgDzgjp0TE1TPkP2SXXLNwp57q6_JIZ04NYPieP7IyGAzJW0L9vycyU8HzbMvXpPMQLc0JuT5o"

parts = NEW_TOKEN.split(".")
def b64url_decode(s):
    s = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

header = json.loads(b64url_decode(parts[0]))
payload = json.loads(b64url_decode(parts[1]))

print("=" * 70)
print("TOKEN HEADER:", json.dumps(header))
print("=" * 70)
print(f"tokenId:       {payload.get('tokenId')}")
print(f"realUserId:    {payload.get('realUserId')}")
print(f"iat:           {payload.get('iat')}  ({datetime.datetime.fromtimestamp(payload.get('iat',0))})")
print(f"exp:           {payload.get('exp')}  ({datetime.datetime.fromtimestamp(payload.get('exp',0))})")
print(f"ignoreRateLimits: {payload.get('ignoreRateLimits')}")
print()
print("ACCESS RULES:")
rules = {r.get("id"): r for r in payload.get("accessRules", [])}
for r in payload.get("accessRules", []):
    print(f"  - {r.get('id')}")
    print(f"      methods:   {r.get('methods')}")
    print(f"      roles:     {r.get('roles')}")
    print(f"      resources: {r.get('resources')}")

print()
print("=" * 70)
print("PERMISSION CHECKS (compared to OLD token):")
needed = [
    ("metaapi-provisioning-api",      "Create / list / delete MetaApi accounts"),
    ("trading-account-management-api","Manage trading accounts"),
    ("metaapi-rest-api",              "Per-account REST (candles, prices, account info)"),
    ("metaapi-rpc-api",               "Per-account RPC (trade, positions)"),
    ("metaapi-real-time-streaming-api","Real-time streaming"),
    ("metastats-api",                 "Stats (trade history, equity curve)"),
    ("risk-management-api",           "Risk management"),
    ("copyfactory-api",               "CopyFactory strategies & subscribers"),
    ("mt-manager-api",                "MT Manager (trade on any account)"),
    ("billing-api",                   "Billing (read-only)"),
]
all_ok = True
for api_id, desc in needed:
    if api_id in rules:
        r = rules[api_id]
        roles = r.get("roles", [])
        resources = r.get("resources", [])
        scope = "ALL" if any("*:$USER_ID$:*" in s for s in resources) else "LIMITED"
        is_writer = "writer" in roles
        marker = "[OK]  " if (is_writer and scope == "ALL") else "[LMT] "
        if api_id == "billing-api":
            marker = "[OK]  " if "reader" in roles else "[MISS]"
        if not (is_writer and scope == "ALL") and api_id != "billing-api":
            all_ok = False
        print(f"  {marker}{api_id:35s} ({'/'.join(roles)}) scope={scope} - {desc}")
    else:
        all_ok = False
        print(f"  [MISS]{api_id:35s} - {desc}")

print()
print("=" * 70)
print("CAN AUTO-PROVISION?", "YES ✅" if all_ok else "NO ❌")

# Now do a LIVE PROBE against the MetaApi provisioning API
print()
print("=" * 70)
print("LIVE PROBE: GET https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts")
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
req = Request(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    headers={"auth-token": NEW_TOKEN}
)
try:
    with urlopen(req, context=ctx, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        print(f"HTTP {resp.status}")
        try:
            data = json.loads(body)
            arr = data if isinstance(data, list) else data.get("accounts", [])
            print(f"Got {len(arr)} account(s):")
            for a in arr:
                print(f"  - login={a.get('login')} server={a.get('server')} state={a.get('state')} id={a.get('_id') or a.get('id')}")
        except Exception as e:
            print(f"  (couldn't parse JSON: {e})")
            print(f"  body[:500]: {body[:500]}")
except HTTPError as e:
    print(f"HTTP {e.code} {e.reason}")
    print(f"body: {e.read().decode('utf-8', errors='replace')[:500]}")
except URLError as e:
    print(f"URL error: {e}")
except Exception as e:
    print(f"Error: {e}")

# Probe CopyFactory too
print()
print("=" * 70)
print("LIVE PROBE: GET /users/current/servers/mt-client-api (provisioning API for client domain)")
req = Request(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/servers/mt-client-api",
    headers={"auth-token": NEW_TOKEN}
)
try:
    with urlopen(req, context=ctx, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        print(f"HTTP {resp.status}")
        print(f"body: {body[:500]}")
except HTTPError as e:
    print(f"HTTP {e.code} {e.reason}")
    print(f"body: {e.read().decode('utf-8', errors='replace')[:500]}")
except Exception as e:
    print(f"Error: {e}")
