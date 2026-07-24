#!/usr/bin/env python3
"""Test the new token v3 — should have Provisioning API."""
import json, base64, ssl, sys, datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError

NEW_TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LWFjY291bnQtZ2VuZXJhdG9yOmNyZWF0ZU1UNURlbW9BY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpjcmVhdGVBY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpnZXRBY2NvdW50UmVwbGljYXMiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmNyZWF0ZUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpnZXRBY2NvdW50cyIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6Z2V0QWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6dXBkYXRlQWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6cmVtb3ZlQWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hYWdlbWVudDpnZXRBY2NvdW50UmVwbGljYSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6dXBkYXRlQWNjb3VudFJlcGxpY2EiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OnJlbW92ZUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDppbmNyZWFzZVJlbGlhYmlsaXR5IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDplbmFibGVSaXNrTWFuYWdlbWVudEFwaSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6ZW5hYmxlTWV0YVN0YXRzQXBpIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDp1bmRlcGxveUFjY291bnQiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OnVuZGVwbG95QWNjb3VudFJlcGxpY2EiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmRlcGxveUFjY291bnQiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmRlcGxveUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpyZWRlcGxveUFjY291bnQiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OnJlZGVwbG95QWNjb3VudFJlcGxpY2EiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmdldEtub3duTWV0YVRyYWRlclNlcnZlcnMiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6bXQtc2VydmVyLW1hbmFnZW1lbnQ6Y3JlYXRlUHJvdmlzaW9uaW5nUHJvZmlsZSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzptdC1zZXJ2ZXItbWFuYWdlbWVudDpnZXRQcm92aXNpb25pbmdQcm9maWxlcyIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzptdC1zZXJ2ZXItbWFuYWdlbWVudDp1cGxvYWRGaWxlIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LXNlcnZlci1tYW5hZ2VtZW50OmdldFByb3Zpc2lvbmluZ1Byb2ZpbGUiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6bXQtc2VydmVyLW1hbmFnZW1lbnQ6dXBkYXRlUHJvdmlzaW9uaW5nUHJvZmlsZSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzptdC1zZXJ2ZXItbWFuYWdlbWVudDpkZWxldGVQcm92aXNpb25pbmdQcm9maWxlIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOnF1b3RhczpnZXRVc2VyUXVvdGFVcGRhdGVSZXF1ZXN0cyIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzpxdW90YXM6Z2V0UXVvdGFzIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOnF1b3RhczpjcmVhdGVRdW90YVVwZGF0ZVJlcXVlc3QiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhYXBpLXJwYy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhYXBpLXJlYWwtdGltZS1zdHJlYW1pbmctYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTExNzEsImV4cCI6MTc5MjY4NzE3MX0.YJWp8MUu_-WAoZn04eqQ6zrlcrWkZv-K4qZhu5xXxBVILzV8NUaJ3wmi5rOZlWzQVkg2ljpTddSo0cH3dsgmEFfQpDxnDnIGXnpjbdujlFqQ0DSEhEs1BOa3QG-xUaF1ZWhWyRjEYzMSfggFRVo8KJWzVR1ahBQOx47bFTvIxn6JA5Wb3kIXkjIgLQQ5DSmj-LRJmYZC9IiDxRFQPVmKKTO737TtobpdlJUyGCqvU1W4p9lfq4momN8QzzGlym3NA5qeXojDtsFJlJpgr6OG7YPPsAQ2JtUog30jGt_JTtogTFcshlT4XHa_BJnjsHBPkp4uv8vUIWWqzqiRi6wNcJ-fHWp6KQJqTMPHYrTAFh_67gj2t51OgzuKexw5Dmim3Eb6rWXXxTK18hrcxyxoAfs2yRL1Ozix1gZBXhMYdqsA_REfbtJaC8pt3_YoyplQwdC5YfbeoCEZC9-3UBJQ-Xctg6jjHGVIu2MtoeW8kInkdcCTqwnBUlo0n_2z30iSCUSfc1ULFLrbt0fkQAuijRBXnrSseLP0-YbEqjQcw0pB7lqiAIZ-11qvvmD8jTIYUsju1H3ER7zbd7lYb6Pxdt0DcavFDacklbpkCODVboG7Vm2uLY1yDxdXlxB1iw4QLxzl0Bv41nm_G3-jt5vef6V6pion0dS9YJHATCu2nAU"

parts = NEW_TOKEN.split(".")
def b64url_decode(s):
    s = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

payload = json.loads(b64url_decode(parts[1]))

print("=" * 70)
print(f"tokenId: {payload.get('tokenId')}")
print(f"iat:     {datetime.datetime.fromtimestamp(payload.get('iat',0))}")
print(f"exp:     {datetime.datetime.fromtimestamp(payload.get('exp',0))}")
print()

print("ACCESS RULES ({} rules):".format(len(payload.get("accessRules", []))))
for r in payload.get("accessRules", []):
    print(f"  - {r.get('id')}")
    methods = r.get("methods", [])
    roles = r.get("roles", [])
    resources = r.get("resources", [])
    print(f"      methods count: {len(methods)}")
    print(f"      roles:         {roles}")
    print(f"      resources:     {resources}")
    # Print first 3 method names only (the new token has many granular methods)
    if methods:
        for m in methods[:5]:
            print(f"        - {m}")
        if len(methods) > 5:
            print(f"        ... (+{len(methods)-5} more)")
    print()

# Check key permissions
print("=" * 70)
print("KEY CHECK: Does the token have the 'createMT5DemoAccount' + 'createAccount' methods?")
rules = {r.get("id"): r for r in payload.get("accessRules", [])}
tam = rules.get("trading-account-management-api", {})
methods = tam.get("methods", [])
print(f"  createMT5DemoAccount:        {'createMT5DemoAccount' in str(methods) or 'createMT5DemoAccount' in ' '.join(methods)}")
print(f"  createAccount:               {'createAccount' in ' '.join(methods)}")
print(f"  getAccounts:                 {'getAccounts' in ' '.join(methods)}")
print(f"  getAccount:                  {'getAccount' in ' '.join(methods)}")
print(f"  deployAccount:               {'deployAccount' in ' '.join(methods)}")
print(f"  undeployAccount:             {'undeployAccount' in ' '.join(methods)}")

# Live probe
print()
print("=" * 70)
print("LIVE PROBE")
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(url, label, method="GET", data=None):
    print(f"\n--- {label} ---")
    print(f"{method} {url}")
    headers = {"auth-token": NEW_TOKEN}
    if data:
        headers["Content-Type"] = "application/json"
    req = Request(url, headers=headers, data=data, method=method)
    try:
        with urlopen(req, context=ctx, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"HTTP {resp.status}")
            try:
                j = json.loads(body)
                print(f"JSON: {json.dumps(j, indent=2)[:600]}")
            except:
                print(f"body[:600]: {body[:600]}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}")
        print(f"body: {body[:400]}")
    except Exception as e:
        print(f"Error: {e}")

# 1. List accounts (the critical test)
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    "PROVISIONING: list accounts (CRITICAL TEST)",
)

# 2. Get client API server domain
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/servers/mt-client-api",
    "PROVISIONING: get client API domain",
)

# 3. Get known MetaTrader servers (used to validate server names)
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/mt-servers",
    "PROVISIONING: list mt-servers",
)

# 4. Get master account info (using client API)
probe(
    "https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346/account-information",
    "CLIENT API: master account info",
)

# 5. CopyFactory: list strategies
probe(
    "https://copyfactory-api-v1.new-york.agiliumtrade.ai/users/current/configuration/strategies",
    "COPYFACTORY: list strategies",
)
