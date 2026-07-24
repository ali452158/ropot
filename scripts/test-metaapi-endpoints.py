#!/usr/bin/env python3
"""Test MetaApi provisioning API endpoints with the token to find what works."""

import os
import json
import urllib.request
import ssl

# Load token from .env
TOKEN = ""
ENV_PATH = "/home/z/my-project/.env"
with open(ENV_PATH) as f:
    for line in f:
        if line.startswith("META_API_TOKEN="):
            TOKEN = line.strip().split("=", 1)[1]
            break

if not TOKEN:
    print("ERROR: No META_API_TOKEN found in .env")
    exit(1)

print(f"Token loaded: {TOKEN[:60]}...{TOKEN[-20:]}")
print(f"Token length: {len(TOKEN)}")
print()

PROVISIONING_DOMAIN = "mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"

# Disable SSL verification (matches our Node config)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

endpoints = [
    ("GET", f"https://{PROVISIONING_DOMAIN}/users/current/accounts"),
    ("GET", f"https://{PROVISIONING_DOMAIN}/users/current/servers/mt-client-api"),
    ("GET", f"https://{PROVISIONING_DOMAIN}/users/current/regions"),
    ("GET", f"https://{PROVISIONING_DOMAIN}/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346"),
    ("GET", f"https://{PROVISIONING_DOMAIN}/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346/account-information"),
]

for method, url in endpoints:
    print(f"=== {method} {url} ===")
    try:
        req = urllib.request.Request(url, method=method)
        req.add_header("auth-token", TOKEN)
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  Status: {status}")
            try:
                parsed = json.loads(body)
                print(f"  Body: {json.dumps(parsed, indent=2)[:500]}")
            except Exception:
                print(f"  Body: {body[:500]}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error: {e.code} {e.reason}")
        try:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  Body: {body[:300]}")
        except Exception:
            pass
    except Exception as e:
        print(f"  Error: {e}")
    print()

# Also try the CopyFactory URL directly (hardcoded)
print("=== Test hardcoded CopyFactory URL ===")
cf_urls = [
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.us-west.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
]
for url in cf_urls:
    print(f"--- GET {url} ---")
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("auth-token", TOKEN)
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  Status: {status}")
            try:
                parsed = json.loads(body)
                print(f"  Body: {json.dumps(parsed, indent=2)[:500]}")
            except Exception:
                print(f"  Body: {body[:500]}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error: {e.code} {e.reason}")
        try:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  Body: {body[:300]}")
        except Exception:
            pass
    except Exception as e:
        print(f"  Error: {e}")
    print()
