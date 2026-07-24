#!/usr/bin/env python3
"""Decode the current META_API_TOKEN JWT and list its permissions clearly."""
import os, sys, json, base64
from pathlib import Path

env_path = Path("/home/z/my-project/.env")
token = ""
for line in env_path.read_text().splitlines():
    if line.startswith("META_API_TOKEN="):
        token = line.split("=", 1)[1].strip()
        break

if not token:
    print("ERROR: META_API_TOKEN not found in .env")
    sys.exit(1)

parts = token.split(".")
if len(parts) < 2:
    print("ERROR: not a JWT")
    sys.exit(1)

def b64url_decode(s):
    s = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

header = json.loads(b64url_decode(parts[0]))
payload = json.loads(b64url_decode(parts[1]))

print("=" * 70)
print("TOKEN HEADER:")
print(json.dumps(header, indent=2))
print("=" * 70)
print("TOKEN PAYLOAD (key fields):")
print(f"  tokenId:       {payload.get('tokenId')}")
print(f"  realUserId:    {payload.get('realUserId')}")
print(f"  impersonated:  {payload.get('impersonated')}")
print(f"  iat:           {payload.get('iat')}  ({__import__('datetime').datetime.fromtimestamp(payload.get('iat',0))})")
print(f"  exp:           {payload.get('exp')}  ({__import__('datetime').datetime.fromtimestamp(payload.get('exp',0))})")
print(f"  ignoreRateLimits: {payload.get('ignoreRateLimits')}")
print()
print("ACCESS RULES:")
for r in payload.get("accessRules", []):
    api_id = r.get("id")
    methods = ", ".join(r.get("methods", []))
    roles = ", ".join(r.get("roles", []))
    resources = r.get("resources", [])
    print(f"  - {api_id}")
    print(f"      methods:   {methods}")
    print(f"      roles:     {roles}")
    print(f"      resources: {resources}")
    print()

# Check for the specific permissions we need
print("=" * 70)
print("PERMISSION CHECKS:")
rules = {r.get("id"): r for r in payload.get("accessRules", [])}

needed = [
    ("metaapi-provisioning-api", "Create / list / delete MetaApi accounts"),
    ("copyfactory-api",          "Create / list CopyFactory strategies & subscribers"),
    ("mt-manager-api",           "Manager-level operations (trade on behalf of users)"),
    ("metaapi-rest-api",         "Per-account REST (candles, prices, account info)"),
    ("metaapi-rpc-api",          "Per-account RPC (trade, positions)"),
    ("metastats-api",            "Stats (trade history, equity curve)"),
]

for api_id, desc in needed:
    if api_id in rules:
        r = rules[api_id]
        roles = r.get("roles", [])
        resources = r.get("resources", [])
        scope = "ALL" if any("*:$USER_ID$:*" in s for s in resources) else "LIMITED"
        if scope == "ALL":
            print(f"  [OK]   {api_id:35s} ({'/'.join(roles)}) - {desc}")
        else:
            print(f"  [LMT]  {api_id:35s} ({'/'.join(roles)}) - {desc}")
            print(f"          resources: {resources}")
    else:
        print(f"  [MISS] {api_id:35s} - {desc}")
