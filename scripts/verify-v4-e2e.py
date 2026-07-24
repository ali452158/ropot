#!/usr/bin/env python3
"""Final live verification of v4 token against the actual MetaApi API endpoints
that the ALFA Reports auto-provisioning flow will use.

Endpoints tested (in the order the real flow hits them):
  1. GET  /users/current/accounts                            (list, used by findExistingMetaApiAccount)
  2. GET  /users/current/accounts/{id}                       (get-by-id, used by verifySubscriberConnected)
  3. POST /users/current/accounts  with INVALID body         (verify create auth works — expect 400 not 401)
  4. GET  /users/current/provisioning-profiles               (verify provisioning profiles can be listed)
  5. GET  /users/current/accounts/{id}/account-information   (verify metaapi-rest-api works on client API)
  6. GET  /users/current/configuration/subscribers           (CopyFactory list subscribers)

If endpoints 1, 2, 3 (with 400 not 401) all pass, the auto-provisioning flow
should work end-to-end.
"""
import json
import os
import urllib.request
import urllib.error
import ssl

# Load token from .env so we test the EXACT token that the deployed app will use
TOKEN = None
with open("/home/z/my-project/.env") as f:
    for line in f:
        if line.startswith("META_API_TOKEN="):
            TOKEN = line.strip().split("=", 1)[1]
            break
if not TOKEN:
    raise SystemExit("Could not load META_API_TOKEN from .env")

# Self-signed certs in test environment — disable verification for the probe
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

PROVISIONING_HOST = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"
# Region discovered from the existing account info (we'll fill this in dynamically)
CLIENT_HOST = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai"
COPYFACTORY_HOST = "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai"

def call(method, url, body=None, keep=200000):
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("auth-token", TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, r.read().decode("utf-8", errors="replace")[:keep]
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:keep]
        except Exception:
            pass
        return e.code, body
    except Exception as e:
        return None, f"NETWORK ERROR: {e}"

print("=" * 80)
print("ALFA Reports — End-to-End Token Verification (v4)")
print(f"Token length: {len(TOKEN)} chars")
print("=" * 80)

# Probe 1: list accounts
print("\n[1] GET /users/current/accounts  (list — used by findExistingMetaApiAccount)")
status, body = call("GET", f"{PROVISIONING_HOST}/users/current/accounts")
print(f"    HTTP {status}")
if status == 200:
    accounts = json.loads(body) if body and body.lstrip().startswith("[") else []
    print(f"    Found {len(accounts)} account(s):")
    for a in accounts:
        print(f"      - id={a.get('_id')}  login={a.get('login')}  server={a.get('server')}  state={a.get('state')}  region={a.get('region')}")
    master = accounts[0] if accounts else None
else:
    print(f"    Body: {body}")
    master = None

if not master:
    print("\n[!] No accounts found — cannot continue probes that need an account id.")
    raise SystemExit(1)

MASTER_ID = master["_id"]
MASTER_REGION = master.get("region", "new-york")
# Update client host to the region-specific one
CLIENT_HOST = f"https://mt-client-api-v1.{MASTER_REGION}.agiliumtrade.agiliumtrade.ai"
COPYFACTORY_HOST = f"https://copyfactory-api-v1.{MASTER_REGION}.agiliumtrade.agiliumtrade.ai"
print(f"\n    Using master account id: {MASTER_ID}")
print(f"    Using region:            {MASTER_REGION}")

# Probe 2: get account by id
print(f"\n[2] GET /users/current/accounts/{MASTER_ID}  (used by verifySubscriberConnected)")
status, body = call("GET", f"{PROVISIONING_HOST}/users/current/accounts/{MASTER_ID}")
print(f"    HTTP {status}")
if status == 200:
    a = json.loads(body)
    print(f"    login={a.get('login')} state={a.get('state')} connectionStatus={a.get('connectionStatus')}")
else:
    print(f"    Body: {body}")

# Probe 3: POST create account with INVALID body — expect 400 (auth OK) not 401 (auth fail)
print("\n[3] POST /users/current/accounts  with INVALID body (auth check, expect 400/4xx not 401)")
invalid_body = json.dumps({
    "login": "99999999999",  # bogus login
    "password": "WRONG_PASSWORD_FOR_PROBE_ONLY",
    "server": "Nonexistent-Server-XYZ",
    "name": "ALFA PROBE TEST — should fail validation, not auth",
    "type": "cloud-g2",
    "platform": "mt5",
    "application": "ALFA-Reports-Probe",
    "magic": 770077,
}).encode()
status, body = call("POST", f"{PROVISIONING_HOST}/users/current/accounts", body=invalid_body)
print(f"    HTTP {status}")
print(f"    Body: {body[:500]}")
if status == 401:
    print("    >>> AUTH FAIL — token still rejected on POST")
elif status in (400, 403, 409, 422):
    print("    >>> AUTH OK — got validation/permission error, NOT 401. create endpoint reachable.")
elif status in (200, 201):
    print("    >>> WARN — account was actually created (unexpected for invalid body)")
else:
    print(f"    >>> Unexpected status {status}")

# Probe 4: provisioning profiles
print("\n[4] GET /users/current/provisioning-profiles  (provisioning profile list)")
status, body = call("GET", f"{PROVISIONING_HOST}/users/current/provisioning-profiles")
print(f"    HTTP {status}")
print(f"    Body: {body[:300]}")

# Probe 5: client API — account information (metaapi-rest-api)
print(f"\n[5] GET /users/current/accounts/{MASTER_ID}/account-information  (metaapi-rest-api on client API)")
status, body = call("GET", f"{CLIENT_HOST}/users/current/accounts/{MASTER_ID}/account-information")
print(f"    HTTP {status}")
print(f"    Body: {body[:300]}")

# Probe 6: CopyFactory — list subscribers
print(f"\n[6] GET /users/current/configuration/subscribers  (CopyFactory API)")
status, body = call("GET", f"{COPYFACTORY_HOST}/users/current/configuration/subscribers")
print(f"    HTTP {status}")
print(f"    Body: {body[:300]}")

# Probe 7: CopyFactory — list strategies
print(f"\n[7] GET /users/current/configuration/strategies  (CopyFactory API)")
status, body = call("GET", f"{COPYFACTORY_HOST}/users/current/configuration/strategies")
print(f"    HTTP {status}")
print(f"    Body: {body[:300]}")

print("\n" + "=" * 80)
print("VERDICT")
print("=" * 80)
print("If probes [1], [2], [3] returned 200/200/non-401 respectively,")
print("the ALFA Reports auto-provisioning flow should work end-to-end.")
print("Probes [5], [6], [7] verify the downstream CopyFactory + MetaApi")
print("client APIs that the flow uses after provisioning.")
