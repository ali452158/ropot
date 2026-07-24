#!/usr/bin/env python3
"""Probe CopyFactory with POST and additional headers."""

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

BASE_URLS = [
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai",
    "https://copyfactory-api-v1.us-west.agiliumtrade.agiliumtrade.ai",
]

PATHS = [
    "/users/current/configuration/strategies",
    "/users/current/strategies",
    "/users/current/configuration/subscribers",
    "/users/current/subscribers",
    "/v1/users/current/configuration/strategies",
    "/users/current",
    "/",
]

print("=== POST tests ===")
for base in BASE_URLS:
    for path in PATHS:
        url = base + path
        body = b"{}"
        try:
            req = urllib.request.Request(url, data=body, method="POST")
            req.add_header("auth-token", TOKEN)
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                resp_body = resp.read().decode("utf-8", errors="replace")
                print(f"  POST {url} → {resp.status}")
                print(f"    Body: {resp_body[:300]}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:150]
            # Only print non-404 (404 means nginx doesn't recognize the path)
            if e.code != 404 or "nginx" not in body:
                print(f"  POST {url} → HTTP {e.code}: {body}")
        except Exception as e:
            print(f"  POST {url} → Error: {e}")

print()
print("=== Check if the host responds to ANYTHING besides 404 nginx ===")
import socket
for host in ["copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai"]:
    try:
        ip = socket.gethostbyname(host)
        print(f"  {host} → {ip}")
    except Exception as e:
        print(f"  {host} → DNS error: {e}")
