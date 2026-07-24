#!/usr/bin/env python3
"""Probe the MetaApi client API and CopyFactory API to determine the correct
URL pattern. Tests three variants:
  A) Global URL:   https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/...
  B) Region URL:   https://mt-client-api-v1.london.agiliumtrade.agiliumtrade.ai/...
  C) TLD-only URL: https://mt-client-api-v1.london.agiliumtrade.ai/...   (current code)

Same three variants for CopyFactory:
  A) https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai/...
  B) https://copyfactory-api-v1.london.agiliumtrade.agiliumtrade.ai/...
  C) https://copyfactory-api-v1.london.agiliumtrade.ai/...

Whichever returns 200 (or 401 from MetaApi backend, not 404 from nginx) is correct.
"""
import json
import ssl
import urllib.request
import urllib.error

TOKEN = None
with open("/home/z/my-project/.env") as f:
    for line in f:
        if line.startswith("META_API_TOKEN="):
            TOKEN = line.strip().split("=", 1)[1]
            break

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ACCOUNT_ID = "fe905f8a-387a-4051-bf87-f818ae139346"

def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("auth-token", TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            return r.status, r.read().decode("utf-8", errors="replace")[:300]
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        return e.code, body
    except Exception as e:
        return None, f"NETWORK: {e}"

print("=" * 80)
print("MetaApi Client API + CopyFactory URL Probe")
print("=" * 80)

# Client API variants
client_paths = [
    f"/users/current/accounts/{ACCOUNT_ID}/account-information",
    f"/users/current/accounts/{ACCOUNT_ID}/positions",
]
client_hosts = [
    ("A-global",      "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai"),
    ("B-region",      "https://mt-client-api-v1.london.agiliumtrade.agiliumtrade.ai"),
    ("C-tld-only",    "https://mt-client-api-v1.london.agiliumtrade.ai"),
]
print("\n--- Client API URL variants ---")
for label, host in client_hosts:
    for path in client_paths:
        url = f"{host}{path}"
        status, body = call("GET", url)
        is_nginx_404 = "nginx" in body and "<title>404 Not Found</title>" in body
        marker = " 404(nginx)" if is_nginx_404 else ""
        print(f"  [{label}] HTTP {status}{marker}  {path[:60]}")
        if status == 200 or (status and not is_nginx_404 and status != 404):
            print(f"           body: {body[:200]}")

# CopyFactory API variants
cf_paths = [
    "/users/current/configuration/subscribers",
    "/users/current/configuration/strategies",
]
cf_hosts = [
    ("A-global",      "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai"),
    ("B-region",      "https://copyfactory-api-v1.london.agiliumtrade.agiliumtrade.ai"),
    ("C-tld-only",    "https://copyfactory-api-v1.london.agiliumtrade.ai"),
    ("D-vint-hill",   "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai"),
]
print("\n--- CopyFactory API URL variants ---")
for label, host in cf_hosts:
    for path in cf_paths:
        url = f"{host}{path}"
        status, body = call("GET", url)
        is_nginx_404 = "nginx" in body and "<title>404 Not Found</title>" in body
        marker = " 404(nginx)" if is_nginx_404 else ""
        print(f"  [{label}] HTTP {status}{marker}  {path[:60]}")
        if status == 200 or (status and not is_nginx_404 and status != 404):
            print(f"           body: {body[:200]}")

# Also probe /users/current/regions to see what regions are available
print("\n--- Provisioning API: list regions ---")
url = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/regions"
status, body = call("GET", url)
print(f"  HTTP {status}")
print(f"  body: {body[:400]}")
