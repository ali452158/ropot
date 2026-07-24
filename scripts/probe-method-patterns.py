#!/usr/bin/env python3
"""
The new token v3 has GRANULAR methods like:
  trading-account-management-api:rest:public:account-management:createAccount

Not the wildcard pattern:
  trading-account-management-api:rest:public:*:*

The 401 errors suggest the API endpoint at /users/current/accounts is checking
the AUTH header against a DIFFERENT method pattern than what the token has.

Let's decode the new token's method patterns and compare with the OLD token.

OLD token v2 (worked for some endpoints) had:
  trading-account-management-api:rest:public::*

NEW token v3 has:
  trading-account-management-api:rest:public:account-management:createAccount
  trading-account-management-api:rest:public:account-management:createAccountReplica
  trading-account-management-api:rest:public:account-management:getAccounts
  ...etc (granular)

Notice the DIFFERENCE:
  OLD: trading-account-management-api:rest:public::*   (single wildcard segment)
  NEW: trading-account-management-api:rest:public:account-management:createAccount  (granular)

These patterns are DIFFERENT! The OLD token used "public::*" (one wildcard segment).
The NEW token uses "public:account-management:createAccount" (specific path).

The Provisioning API expects:
  trading-account-management-api:rest:public::*

But the new token ONLY grants specific granular methods, not the wildcard.

Wait — that doesn't match either. The 401 happens on EVERY call, including
CopyFactory which has the wildcard pattern `copyfactory-api:rest:public:*:*`.

Let me look more carefully...

Actually looking again:
  OLD token v2 copyfactory:
    "copyfactory-api:rest:public:*:*"
  NEW token v3 copyfactory:
    "copyfactory-api:rest:public:*:*"

These are the SAME. But the new token's call to copyfactory-api also returns 401.

So the issue isn't the method pattern. Both tokens have the same copyfactory
pattern, but neither works.

Hmm, maybe the issue is different. Let me try sending the request differently:
- With "Auth-Token" header (capital A, capital T) instead of "auth-token"
- With "Authorization: Bearer <token>" instead
- Without auth-token at all (to see what error we get)
"""
import ssl, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

NEW_TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LWFjY291bnQtZ2VuZXJhdG9yOmNyZWF0ZU1UNURlbW9BY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpjcmVhdGVBY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpnZXRBY2NvdW50UmVwbGljYXMiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmNyZWF0ZUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpnZXRBY2NvdW50cyIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6Z2V0QWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6dXBkYXRlQWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6cmVtb3ZlQWNjb3VudCIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6Z2V0QWNjb3VudFJlcGxpY2EiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OnVwZGF0ZUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpyZW1vdmVBY2NvdW50UmVwbGljYSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6aW5jcmVhc2VSZWxpYWJpbGl0eSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6ZW5hYmxlUmlza01hbmFnZW1lbnRBcGkiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6YWNjb3VudC1tYW5hZ2VtZW50OmVuYWJsZU1ldGFTdGF0c0FwaSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LUFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6dW5kZXBsb3lBY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDp1bmRlcGxveUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpkZXBsb3lBY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpkZXBsb3lBY2NvdW50UmVwbGljYSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzphY2NvdW50LW1hbmFnZW1lbnQ6cmVkZXBsb3lBY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpyZWRlcGxveUFjY291bnRSZXBsaWNhIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpnZXRLbm93bk1ldGFUcmFkZXJTZXJ2ZXJzIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LXNlcnZlci1tYW5hZ2VtZW50OmNyZWF0ZVByb3Zpc2lvbmluZ1Byb2ZpbGUiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6bXQtc2VydmVyLW1hbmFnZW1lbnQ6Z2V0UHJvdmlzaW9uaW5nUHJvZmlsZXMiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6bXQtc2VydmVyLW1hbmFnZW1lbnQ6dXBsb2FkRmlsZSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LUFwaTpyZXN0OnB1YmxpYzptdC1zZXJ2ZXItbWFuYWdlbWVudDpnZXRQcm92aXNpb25pbmdQcm9maWxlIiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LXNlcnZlci1tYW5hZ2VtZW50OnVwZGF0ZVByb3Zpc2lvbmluZ1Byb2ZpbGUiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6bXQtc2VydmVyLW1hbmFnZW1lbnQ6ZGVsZXRlUHJvdmlzaW9uaW5nUHJvZmlsZSIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LUFwaTpyZXN0OnB1YmxpYzpxdW90YXM6Z2V0VXNlclF1b3RhVXBkYXRlUmVxdWVzdHMiLCJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6cXVvdGFzOmdldFF1b3RhcyIsInRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzpxdW90YXM6Y3JlYXRlUXVvdGFVcGRhdGVSZXF1ZXN0Il0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFzdGF0cy1hcGkiLCJtZXRob2RzIjpbIm1ldGFzdGF0cy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoicmlzay1tYW5hZ2VtZW50LXFwaSIsIm1ldGhvZHMiOlsicmlzay1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LXFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6ImJpbGxpbmctYXBpIiwibWV0aG9kcyI6WyJiaWxsaW5nLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkxMTE3MSwiZXhwIjoxNzkyNjg3MTcxfQ.YJWp8MUu_-WAoZn04eqQ6zrlcrWkZv-K4qZhu5xXxBVILzV8NUaJ3wmi5rOZlWzQVkg2ljpTddSo0cH3dsgmEFfQpDxnDnIGXnpjbdujlFqQ0DSEhEs1BOa3QG-xUaF1ZWhWyRjEYzMSfggFRVo8KJWzVR1ahBQOx47bFTvIxn6JA5Wb3kIXkjIgLQQ5DSmj-LRJmYZC9IiDxRFQPVmKKTO737TtobpdlJUyGCqvU1W4p9lfq4momN8QzzGlym3NA5qeXojDtsFJlJpgr6OG7YPPsAQ2JtUog30jGt_JTtogTFcshlT4XHa_BJnjsHBPkp4uv8vUIWWqzqiRi6wNcJ-fHWp6KQJqTMPHYrTAFh_67gj2t51OgzuKexw5Dmim3Eb6rWXXxTK18hrcxyxoAfs2yRL1Ozix1gZBXhMYdqsA_REfbtJaC8pt3_YoyplQwdC5YfbeoCEZC9-3UBJQ-Xctg6jjHGVIu2MtoeW8kInkdcCTqwnBUlo0n_2z30iSCUSfc1ULFLrbt0fkQAuijRBXnrSseLP0-YbEqjQcw0pB7lqiAIZ-11qvvmD8jTIYUsju1H3ER7zbd7lYb6Pxdt0DcavFDacklbpkCODVboG7Vm2uLY1yDxdXlxB1iw4QLxzl0Bv41nm_G3-jt5vef6V6pion0dS9YJHATCu2nAU"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(url, label, headers):
    print(f"\n--- {label} ---")
    print(f"GET {url}")
    print(f"Headers: {list(headers.keys())}")
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, context=ctx, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"HTTP {resp.status}")
            print(f"body[:300]: {body[:300]}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}")
        print(f"body[:300]: {body[:300]}")
    except Exception as e:
        print(f"Error: {e}")

url = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts"

# Try 1: standard auth-token header (lowercase)
probe(url, "Try 1: auth-token (lowercase)", {"auth-token": NEW_TOKEN})

# Try 2: Auth-Token (capitalized)
probe(url, "Try 2: Auth-Token (capitalized)", {"Auth-Token": NEW_TOKEN})

# Try 3: AUTH-TOKEN (all caps)
probe(url, "Try 3: AUTH-TOKEN (all caps)", {"AUTH-TOKEN": NEW_TOKEN})

# Try 4: Authorization Bearer
probe(url, "Try 4: Authorization Bearer", {"Authorization": f"Bearer {NEW_TOKEN}"})

# Try 5: No auth at all (to confirm it really requires auth)
probe(url, "Try 5: NO auth (baseline)", {})

# Try 6: api-key
probe(url, "Try 6: api-key", {"api-key": NEW_TOKEN})

# Try 7: token
probe(url, "Try 7: token", {"token": NEW_TOKEN})

# Try 8: x-api-key
probe(url, "Try 8: x-api-key", {"x-api-key": NEW_TOKEN})

# Also try the metaapi.cloud official domain with different paths
print("\n" + "=" * 70)
print("Try official metaapi.cloud domain variations:")
for path in [
    "/provisioning-api/v1/users/current/accounts",
    "/v1/provisioning/users/current/accounts",
    "/users/current/accounts",
    "/api/v1/users/current/accounts",
    "/mt-provisioning-api/v1/users/current/accounts",
]:
    probe(f"https://api.metaapi.cloud{path}", f"api.metaapi.cloud {path}", {"auth-token": NEW_TOKEN})

# Try direct metaapi.cloud subdomain
print("\n" + "=" * 70)
print("Try metaapi.cloud subdomains:")
for sub in ["provisioning", "mt-provisioning", "api"]:
    probe(f"https://{sub}.metaapi.cloud/users/current/accounts", f"{sub}.metaapi.cloud", {"auth-token": NEW_TOKEN})
