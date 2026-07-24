#!/usr/bin/env python3
"""Analyze token v5 and probe the live MetaApi API to verify it works."""
import json
import base64
import sys
import ssl
import urllib.request
import urllib.error

TOKEN = (
    "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9."
    "eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIiwiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkxNzY2MywiZXhwIjoxNzkyNjkzNjYzfQ."
    "LF_MG-nbaD4NC62nuNSLMgsPCpmw0S9gQg_YW_B-hdSYpz75nn_e7dz6biUCmYkFKkt4UxBIzWWmYkKH7QSdrz03GwZ0fOa9Dz-w56abHeazcavw6gjeXoxXbgNoojWA-FcWyq5yOXXKIANOB6laBQh5zd5LztrJgMps6_QXf64szqwMoxXdGa6nVKK_psFBsSwyFhXePoGx33C3wtofxt87lLTR7UpcNG2THNF6jQvur5keIE12WmBlLqdJvn92fscUg0RFiAaP_0RWwItpplr-MNOZ9puax5YcwC5aKKrbevEawZ_TpVEupwk7Q0E74NifBdeKwivg36ZDtKnRkLyQ5mAxuk85pPflHa6vUIdieAEyIrZ_pIDOb2Oh3nkUn5eIKykzaWfesq2v5jjRgR-BxMA7ptTP_MrOVDJek_iMJxyx78w2i4ym8qLjjPIgD5gOSZQwGtYe1JWbhhjU3-EXu7SHUBFDZFQhUvfiaECIfcDL6LVkaOSnoKYR5-QwV5Y-7dM2-tUYHgOgMJupJ945QVOxH-JgtPq3mzA0DJrM1E5UqzLA51RUp1VG91YmyTsbJqHlHZ8mzsY1E5Jjarn4aNvodRjAVCIfnWS6s4qEcAtQAGnuVBpVlj4ESmD0ctGAGmWAhVMGwRXP5DfP_Vy7Ud7xm93mZ8M_gFnviq4"
)

def b64url_decode(s):
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def decode_jwt(token):
    parts = token.split(".")
    header = json.loads(b64url_decode(parts[0]))
    payload = json.loads(b64url_decode(parts[1]))
    return header, payload

def analyze(payload):
    rules = payload.get("accessRules", [])
    flags = {
        "hasTradingAccountMgmtApi": False,
        "tradingAccountMgmtScope": None,
        "hasMetaApiRestApi": False,
        "hasCopyFactoryApi": False,
        "copyfactoryScope": None,  # ALL or LIMITED
        "hasMtManagerApi": False,
        "mtManagerScope": None,
        "hasBillingApi": False,
        "hasMetaStatsApi": False,
        "canAutoProvision": False,  # set below
        "canUseCopyFactory": False,  # set below
    }
    rule_summaries = []
    for r in rules:
        rid = r.get("id")
        methods = r.get("methods", [])
        roles = r.get("roles", [])
        resources = r.get("resources", [])
        # ALL = wildcard resource pattern
        is_all = any(
            isinstance(s, str) and (s == "*:$USER_ID$:*" or s == "*:$USER_ID$" or s == "*")
            for s in resources
        )
        # Special: copyfactory can have "account:$USER_ID$:*" which is wildcard for all accounts
        # for that API specifically.
        cf_account_all = any(
            isinstance(s, str) and s.startswith("account:$USER_ID$:*")
            for s in resources
        )
        scope = "ALL" if (is_all or cf_account_all) else "LIMITED"
        rule_summaries.append({
            "id": rid,
            "methods": methods,
            "roles": roles,
            "resources": resources,
            "scope": scope,
        })
        if rid == "trading-account-management-api":
            flags["hasTradingAccountMgmtApi"] = True
            flags["tradingAccountMgmtScope"] = scope
            if "writer" in roles and scope == "ALL":
                flags["canAutoProvision"] = True
        if rid == "metaapi-rest-api":
            flags["hasMetaApiRestApi"] = True
        if rid == "copyfactory-api":
            flags["hasCopyFactoryApi"] = True
            flags["copyfactoryScope"] = scope
            if "writer" in roles and scope == "ALL":
                flags["canUseCopyFactory"] = True
        if rid == "mt-manager-api":
            flags["hasMtManagerApi"] = True
            flags["mtManagerScope"] = scope
        if rid == "billing-api":
            flags["hasBillingApi"] = True
        if rid == "metastats-api":
            flags["hasMetaStatsApi"] = True
    return flags, rule_summaries

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def probe(url, method="GET", body=None):
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("auth-token", TOKEN)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, r.read().decode("utf-8", errors="replace")[:400]
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            pass
        return e.code, body
    except Exception as e:
        return None, f"NETWORK: {e}"

def main():
    print("=" * 80)
    print("MetaApi Token v5 — Analysis & Live Probe")
    print("=" * 80)
    header, payload = decode_jwt(TOKEN)
    flags, rules = analyze(payload)

    print(f"\nrealUserId:  {payload.get('realUserId')}")
    print(f"tokenId:     {payload.get('tokenId')}")
    print(f"iat:         {payload.get('iat')} ({__import__('datetime').datetime.utcfromtimestamp(payload.get('iat')).isoformat()})")
    print(f"exp:         {payload.get('exp')} ({__import__('datetime').datetime.utcfromtimestamp(payload.get('exp')).isoformat()})")
    print(f"ruleCount:   {len(rules)}")

    print("\n--- Access Rules ---")
    for r in rules:
        print(f"\n  [{r['scope']}] {r['id']}")
        print(f"     roles:     {r['roles']}")
        print(f"     methods:   {r['methods']}")
        print(f"     resources: {r['resources']}")

    print("\n--- Derived Flags ---")
    for k, v in flags.items():
        mark = "OK " if v else "MISS"
        print(f"  [{mark}] {k}: {v}")

    # Live probe
    print("\n--- Live API Probes ---")
    PROV = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"

    print("\n[1] GET /users/current/accounts  (list accounts)")
    status, body = probe(f"{PROV}/users/current/accounts")
    print(f"    HTTP {status}")
    if status == 200:
        try:
            data = json.loads(body) if body else []
            if isinstance(data, list):
                print(f"    Found {len(data)} account(s):")
                for a in data[:5]:
                    print(f"      - id={a.get('_id')}  login={a.get('login')}  server={a.get('server')}  state={a.get('state')}  region={a.get('region')}")
        except Exception as e:
            print(f"    (parse error: {e})")
            print(f"    body: {body[:300]}")
    else:
        print(f"    body: {body[:300]}")

    print("\n[2] GET /users/current/servers/mt-client-api  (domain discovery)")
    status, body = probe(f"{PROV}/users/current/servers/mt-client-api")
    print(f"    HTTP {status}")
    print(f"    body: {body[:200]}")

    print("\n[3] POST /users/current/accounts  with INVALID body (expect non-401)")
    invalid = json.dumps({
        "login": "99999999999",
        "password": "WRONG_PROBE_PASSWORD",
        "server": "Nonexistent-Server-XYZ",
        "name": "ALFA PROBE — should fail validation, not auth",
        "type": "cloud-g2",
        "platform": "mt5",
        "application": "ALFA-Reports-Probe",
        "magic": 770077,
    }).encode()
    status, body = probe(f"{PROV}/users/current/accounts", method="POST", body=invalid)
    print(f"    HTTP {status}")
    print(f"    body: {body[:400]}")
    if status == 401:
        print("    >>> AUTH FAIL — token rejected on POST")
    elif status in (400, 403, 409, 422):
        print("    >>> AUTH OK — got validation/permission error, NOT 401. create endpoint reachable.")
    elif status in (200, 201):
        print("    >>> WARN — account actually created")
    else:
        print(f"    >>> Unexpected status {status}")

    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    print(f"canAutoProvision:   {flags['canAutoProvision']}")
    print(f"canUseCopyFactory:  {flags['canUseCopyFactory']}")
    print(f"hasMtManagerApi:    {flags['hasMtManagerApi']} (scope: {flags['mtManagerScope']})")

    if flags["canAutoProvision"] and flags["canUseCopyFactory"]:
        print("\n>>> TOKEN v5 IS READY FOR AUTO-PROVISIONING ✅")
        print("    Update .env + deploy scripts + redeploy.")
    else:
        print("\n>>> TOKEN v5 STILL HAS SCOPING ISSUES ❌")
        if not flags["canAutoProvision"]:
            print(f"    - trading-account-management-api scope is {flags['tradingAccountMgmtScope']} (need ALL)")
        if not flags["canUseCopyFactory"]:
            print(f"    - copyfactory-api scope is {flags['copyfactoryScope']} (need ALL)")

if __name__ == "__main__":
    main()
