#!/usr/bin/env python3
"""Decode a MetaApi JWT token (header + payload only — no signature verification)."""
import sys
import json
import base64

def b64url_decode(s: str) -> bytes:
    s = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s.encode())

def decode(token: str) -> tuple[dict, dict]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Not a JWT — expected 3 parts separated by '.'")
    header = json.loads(b64url_decode(parts[0]))
    payload = json.loads(b64url_decode(parts[1]))
    return header, payload

def summarize(payload: dict) -> None:
    print("=" * 70)
    print("TOKEN SUMMARY")
    print("=" * 70)
    print(f"User ID  : {payload.get('_id')}")
    print(f"Token ID : {payload.get('tokenId')}")
    print(f"Issued   : {payload.get('iat')}  ({__import__('datetime').datetime.utcfromtimestamp(payload.get('iat', 0))})")
    print(f"Expires  : {payload.get('exp')}  ({__import__('datetime').datetime.utcfromtimestamp(payload.get('exp', 0))})")
    print(f"Impersonated: {payload.get('impersonated')}")
    print()
    print("=" * 70)
    print("ACCESS RULES")
    print("=" * 70)
    for rule in payload.get("accessRules", []):
        api_id = rule.get("id")
        roles = rule.get("roles", [])
        methods = rule.get("methods", [])
        resources = rule.get("resources", [])
        print(f"\n• {api_id}")
        print(f"  Roles    : {roles}")
        print(f"  Methods  : {len(methods)} entries")
        for m in methods[:3]:
            print(f"    - {m}")
        if len(methods) > 3:
            print(f"    ... (+{len(methods)-3} more)")
        print(f"  Resources: {len(resources)} entries")
        for r in resources:
            print(f"    - {r}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: decode-jwt.py <token-or-file>")
        sys.exit(1)
    arg = sys.argv[1]
    if arg.startswith("eyJ"):
        token = arg
    else:
        with open(arg, "r") as f:
            token = f.read().strip()
    header, payload = decode(token)
    print("HEADER:")
    print(json.dumps(header, indent=2))
    print()
    summarize(payload)
