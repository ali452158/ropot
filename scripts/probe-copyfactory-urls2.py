#!/usr/bin/env python3
"""Try more CopyFactory URL patterns including without agiliumtrade prefix."""

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

URLS = [
    # Without agiliumtrade prefix
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.us-west.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.us-east.agiliumtrade.ai/users/current/configuration/strategies",
    # Different region name
    "https://copyfactory-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    "https://copyfactory-api-v1.london.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # Without region segment
    "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    # Try the metaapi.cloud domain
    "https://copyfactory-api-v1.vint-hill.metaapi.cloud/users/current/configuration/strategies",
    # Plain copyfactory.cloud
    "https://copyfactory.cloud/users/current/configuration/strategies",
    "https://api.copyfactory.cloud/users/current/configuration/strategies",
    # Try the account-specific URL pattern (using account ID from JWT)
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/9a272d90e6a9d90e81378ba7e819c272/configuration/strategies",
]

for url in URLS:
    print(f"--- GET {url} ---")
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("auth-token", TOKEN)
        with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  ✓ Status: {resp.status}")
            print(f"  Body: {body[:300]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        # Filter out generic nginx 404s
        if e.code == 404 and "nginx" in body:
            print(f"  HTTP 404 (nginx default)")
        else:
            print(f"  HTTP {e.code}: {body}")
    except Exception as e:
        print(f"  Error: {str(e)[:100]}")
