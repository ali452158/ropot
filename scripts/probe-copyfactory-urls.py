#!/usr/bin/env python3
"""Probe different CopyFactory URL patterns to find the working one."""

import json
import urllib.request
import ssl

TOKEN = ""
with open("/home/z/my-project/.env") as f:
    for line in f:
        if line.startswith("META_API_TOKEN="):
            TOKEN = line.strip().split("=", 1)[1]
            break

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Try various URL combinations
URLS = [
    # Vint-hill region (default)
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/",
    # Without the /configuration/ prefix
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/strategies",
    # Us-west region
    "https://copyfactory-api-v1.us-west.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # Us-east
    "https://copyfactory-api-v1.us-east.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # Without -api-v1 suffix
    "https://copyfactory.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # With /api/ prefix
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/api/users/current/configuration/strategies",
    # Stripped domain
    "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # Without region segment
    "https://copyfactory-api-v1.agiliumtrade.ai/users/current/configuration/strategies",
]

for url in URLS:
    print(f"--- GET {url} ---")
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("auth-token", TOKEN)
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  ✓ Status: {resp.status}")
            print(f"  Body: {body[:300]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"  HTTP {e.code}: {body}")
    except Exception as e:
        print(f"  Error: {e}")
    print()
