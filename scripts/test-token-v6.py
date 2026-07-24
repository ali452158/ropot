#!/usr/bin/env python3
"""Test token v6 — final check."""
import json
import base64
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone

TOKEN = (
    "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9."
    "eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIiwiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6ImJpbGxpbmctYXBpIiwibWV0aG9kcyI6WyJiaWxsaW5nLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkxODAwNiwiZXhwIjoxNzkyNjk0MDA2fQ."
    "WUdePT_q8p85q0Xri3-Z3wPghlOTRkOvsN0JRd6lXelUClOcPmvc9zFAS3yPntnvuupDdl1U-ORg624pAGZSywFiruBy73eqmQj6kbSPrG8uWPE7gdXptg8jv8LQFauryK2xes_4dqEPlrwLqzdBMBHN-MQzUt68pDILYd3_V7RUt-VqeGrXEUp-7ywS3AEUFAUBHpjwSLTTMFkPzV5KSZrfzjsJ55xSYIDImPlvpzEPTy9EuoayPyaUALPxa0u6Qf-tSL-qnvbbcAV3RdhudzT2JKnNo6r0mhr7B8aSItmaFx_8Pvklri7kr1exfrwbZwWKYHA8l-o5-RK_EWHSQkvqaKbpWyl_L2CNWroXGoxC2qdPjj_KX6NJfmHK3-jtj_2t8aoXFqoDRqWE2zxdlC2ggf0XOBztH9cUbDOz8OrWTdOw-fP6uxpynta-RF9JNDdTrhgspC53lWnt457EuMSa0gJ7mBWzR2lE1L3nBHn4Q-sKJ2UBXkQgZrOg1s1wXu8dxcmO9D5UCb5RLudlv7TsnkjR_W0ppOd64ZpCntHn4QVb7ROh30Fhje8u_bomvz6ya601s0nhW1WDYZN1g12eOyQk-qjImUVfcbhxFqr_BMOczx0sSwdtiEi-dccYzllqKK8Uj7q6zq5jTmx-Z7CTy4gGkE08cPXBKgkNWn4"
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
        "metaapiRestScope": None,
        "hasMetaApiRpcApi": False,
        "metaapiRpcScope": None,
        "hasMetaStatsApi": False,
        "hasCopyFactoryApi": False,
        "copyfactoryScope": None,
        "hasMtManagerApi": False,
        "mtManagerScope": None,
        "hasBillingApi": False,
        "canAutoProvision": False,
        "canUseCopyFactory": False,
        "canTradeOnAccounts": False,
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
        cf_account_all = any(
            isinstance(s, str) and s.startswith("account:$USER_ID$:*")
            for s in resources
        )
        mt_manager_all = any(
            isinstance(s, str) and (s.startswith("mt-manager:$USER_ID$:*") or s.startswith("mt-account:$USER_ID$:*") or s.startswith("mt-group:$USER_ID$:*"))
            for s in resources
        )
        scope = "ALL" if (is_all or cf_account_all or mt_manager_all) else "LIMITED"
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
            flags["metaapiRestScope"] = scope
        if rid == "metaapi-rpc-api":
            flags["hasMetaApiRpcApi"] = True
            flags["metaapiRpcScope"] = scope
        if rid == "copyfactory-api":
            flags["hasCopyFactoryApi"] = True
            flags["copyfactoryScope"] = scope
            if "writer" in roles and scope == "ALL":
                flags["canUseCopyFactory"] = True
        if rid == "mt-manager-api":
            flags["hasMtManagerApi"] = True
            flags["mtManagerScope"] = scope
            if "writer" in roles and scope == "ALL":
                flags["canTradeOnAccounts"] = True
        if rid == "billing-api":
            flags["hasBillingApi"] = True
        if rid == "metastats-api":
            flags["hasMetaStatsApi"] = True
    return flags, rule_summaries

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def probe(url, method="GET", body=None, keep=200000):
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("auth-token", TOKEN)
    req.add_header("Content-Type", "application/json")
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
        return None, f"NETWORK: {e}"

def main():
    print("=" * 80)
    print("MetaApi Token v6 — Final Analysis & Live Probe")
    print("=" * 80)
    header, payload = decode_jwt(TOKEN)
    flags, rules = analyze(payload)

    print(f"\nrealUserId:  {payload.get('realUserId')}")
    print(f"tokenId:     {payload.get('tokenId')}")
    iat = payload.get('iat')
    exp = payload.get('exp')
    print(f"iat:         {iat} ({datetime.fromtimestamp(iat, tz=timezone.utc).isoformat()})")
    print(f"exp:         {exp} ({datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()})")
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
                    master = a
        except Exception as e:
            print(f"    (parse error: {e})")
            print(f"    body: {body[:300]}")
    else:
        print(f"    body: {body[:300]}")

    print("\n[2] POST /users/current/accounts  with INVALID body")
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
        print("    >>> AUTH FAIL")
    elif status in (400, 403, 409, 422):
        print("    >>> AUTH OK (validation/permission error, NOT 401)")
    elif status in (200, 201):
        print("    >>> WARN — account created")
    else:
        print(f"    >>> Unexpected status")

    # Probe CopyFactory
    print("\n[3] GET copyfactory subscribers")
    status, body = probe("https://copyfactory-api-v1.london.agiliumtrade.ai/users/current/configuration/subscribers")
    print(f"    HTTP {status}")
    print(f"    body: {body[:200]}")

    print("\n[4] GET copyfactory strategies")
    status, body = probe("https://copyfactory-api-v1.london.agiliumtrade.ai/users/current/configuration/strategies")
    print(f"    HTTP {status}")
    print(f"    body: {body[:200]}")

    # Get the master account info to extract login/region/server
    if status == 200:
        try:
            accounts_data = json.loads(probe(f"{PROV}/users/current/accounts")[1])
            if isinstance(accounts_data, list) and accounts_data:
                master = accounts_data[0]
                print(f"\n--- Master Account Details ---")
                print(f"  _id:      {master.get('_id')}")
                print(f"  login:    {master.get('login')}")
                print(f"  server:   {master.get('server')}")
                print(f"  region:   {master.get('region')}")
                print(f"  state:    {master.get('state')}")
                print(f"  connectionStatus: {master.get('connectionStatus')}")
        except Exception as e:
            print(f"  (parse error: {e})")

    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    print(f"canAutoProvision:   {flags['canAutoProvision']}")
    print(f"canUseCopyFactory:  {flags['canUseCopyFactory']}")
    print(f"canTradeOnAccounts: {flags['canTradeOnAccounts']}")

    if flags["canAutoProvision"] and flags["canUseCopyFactory"] and flags["canTradeOnAccounts"]:
        print("\n>>> TOKEN v6 IS FULLY READY FOR END-TO-END FLOW ✅✅✅")
        print("    - Auto-provisioning: OK")
        print("    - CopyFactory:       OK")
        print("    - MT Manager:        OK")
        print("    Update .env + deploy scripts + redeploy.")
    elif flags["canAutoProvision"] and flags["canUseCopyFactory"]:
        print("\n>>> TOKEN v6 IS READY FOR AUTO-PROVISIONING + COPYFACTORY ✅")
        print("    (but missing MT Manager — direct trades won't work)")
    else:
        print("\n>>> TOKEN v6 STILL HAS ISSUES ❌")
        if not flags["canAutoProvision"]:
            print(f"    - trading-account-management-api scope is {flags['tradingAccountMgmtScope']} (need ALL)")
        if not flags["canUseCopyFactory"]:
            print(f"    - copyfactory-api scope is {flags['copyfactoryScope']} (need ALL)")

if __name__ == "__main__":
    main()
