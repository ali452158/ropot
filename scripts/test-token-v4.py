#!/usr/bin/env python3
"""
Test the new MetaApi token (v4) provided by the user.
1. Decode the JWT locally and print the permission analysis.
2. Probe the live MetaApi API endpoints (provisioning + client + copyfactory).
3. Print a clear pass/fail report so we know whether to update .env.
"""
import json
import base64
import sys
import urllib.request
import urllib.error

TOKEN = (
    "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9."
    "eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwidHJhY2tlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDoqZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3RyYXRlZ3k6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiIsInBvcnRmb2xpbzokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3Vic2NyaWJlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LW1hbmFnZXI6JFVTRVJfSUQkOipmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1hY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1ncm91cDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTMwOTUsImV4cCI6MTc5MjY4OTA5NX0."
    "R5QcAmFPrBwJG66st7VBTwm4RjYRDD0isp0xDAXMQ4XLn62IucsuFgI2FiYkm6ARAQ01lJz-LVSPabd3ffBgrM2kVJ1Dp37ah41KlRfD512rrxiuK2DfqfdAUTq6LziW9RbUQ0Hn0Z7JhGuy8jAiw_Ef7T-AKRzlPH2sTCjyrXR89vhID6niS8bYiqQUOBenaYUehBItsMMg0YLJtzPfgTxIzd_PaRcQ0TwdTThp870oD4HvIa_gacU5oNTbDXhDHiV-BWYyx7RyWmt7QlnMqxAPcDemPoC920eeiJhqv20U9QBmse--QC5Us0WNiFSd8AzV3-xSQfVVF69y_1vpnbHXKfHDhhGnSCdY0GP2NqDfQ82yQ4WNgJ8qX0ssgmmGoH-jcAu4Qi2d6QpRk-Scojq26N3TG3CrIGowy8EIFjHarSwbpuI6IqoJmKi2MasaENLgRUp54BigeO0V1s0VNvT--DKqstK3i1alxa8w6IGMPCUno4_0XFEEsexm8F3aA_dkIJ7ONpSlBTCGHgKavGD0bLxedRZhNIEt4QRbCV53yTZ9qtb1lV4JufqtowyxKq4o1f3NLEMA-UVRt93PCQgx_SSTwt2e1tPNxcdV_vOdv0CXP0DkjIxu6XYtK5XD_P724TbUVro8bh7b534N_3SDUvsqwRoZWqcaJ9yqiNw"
)

def b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def decode_jwt(token: str):
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"Expected 3 JWT parts, got {len(parts)}")
    header = json.loads(b64url_decode(parts[0]))
    payload = json.loads(b64url_decode(parts[1]))
    return header, payload, parts[1] + "." + parts[2]  # signing_input for signature check

def analyze_payload(payload: dict) -> dict:
    rules = payload.get("accessRules", [])
    summary = {
        "realUserId": payload.get("realUserId"),
        "tokenId": payload.get("tokenId"),
        "iat": payload.get("iat"),
        "exp": payload.get("exp"),
        "ruleCount": len(rules),
        "rules": [],
        "flags": {
            "hasProvisioningApiRule": False,
            "hasTradingAccountManagementApi": False,
            "hasCopyFactoryApi": False,
            "hasMetaApiRestApi": False,
            "hasMetaStatsApi": False,
            "hasBillingApi": False,
            "canAutoProvision": False,  # set below
            "canUseCopyFactory": False,  # set below
            "canReadAccounts": False,
        },
    }
    for r in rules:
        rid = r.get("id")
        methods = r.get("methods", [])
        roles = r.get("roles", [])
        resources = r.get("resources", [])
        summary["rules"].append({
            "id": rid,
            "methods": methods,
            "roles": roles,
            "resources": resources,
        })
        if rid == "trading-account-management-api":
            summary["flags"]["hasTradingAccountManagementApi"] = True
            if "writer" in roles:
                summary["flags"]["canAutoProvision"] = True
            if "reader" in roles:
                summary["flags"]["canReadAccounts"] = True
        if rid == "metaapi-provisioning-api":
            summary["flags"]["hasProvisioningApiRule"] = True
        if rid == "copyfactory-api":
            summary["flags"]["hasCopyFactoryApi"] = True
            if "writer" in roles:
                summary["flags"]["canUseCopyFactory"] = True
        if rid == "metaapi-rest-api":
            summary["flags"]["hasMetaApiRestApi"] = True
        if rid == "metastats-api":
            summary["flags"]["hasMetaStatsApi"] = True
        if rid == "billing-api":
            summary["flags"]["hasBillingApi"] = True
    return summary

def probe(url: str, token: str, method: str = "GET", body: bytes = None) -> dict:
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("auth-token", token)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            data = resp.read().decode("utf-8", errors="replace")
            return {"ok": True, "status": status, "body": data[:1500]}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return {"ok": False, "status": e.code, "body": body[:1500], "error": str(e)}
    except Exception as e:
        return {"ok": False, "status": None, "body": "", "error": str(e)}

def main():
    print("=" * 80)
    print("MetaApi Token v4 — Analysis & Live Probe")
    print("=" * 80)

    # 1) Decode
    try:
        header, payload, _ = decode_jwt(TOKEN)
    except Exception as e:
        print(f"[FATAL] Failed to decode JWT: {e}")
        sys.exit(1)

    print("\n--- JWT Header ---")
    print(json.dumps(header, indent=2))

    print("\n--- JWT Payload (compact) ---")
    summary = analyze_payload(payload)
    print(json.dumps(summary, indent=2, ensure_ascii=False))

    print("\n--- Permission Flags ---")
    for k, v in summary["flags"].items():
        mark = "OK " if v else "MISS"
        print(f"  [{mark}] {k}: {v}")

    # 2) Live probe — Provisioning API
    print("\n--- Live API Probes ---")
    probes = [
        ("Provisioning API: list accounts",
         "GET",
         "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
         None),
        ("Provisioning API: list MT servers",
         "GET",
         "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/servers/mt-client-api",
         None),
        ("Billing API: get profile (verify token works at all)",
         "GET",
         "https://billing-v1.agiliumtrade.agiliumtrade.ai/users/current/profile",
         None),
        ("MetaApi Client API: list accounts (alternate path)",
         "GET",
         "https://mt-client-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/accounts",
         None),
        ("CopyFactory API: list strategies",
         "GET",
         "https://copyfactory-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
         None),
        ("MetaApi: account by id (use master if known)",
         "GET",
         "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/474240052",
         None),
    ]
    results = []
    for label, method, url, body in probes:
        print(f"\n[{label}]")
        print(f"  {method} {url}")
        r = probe(url, TOKEN, method=method, body=body)
        results.append({"label": label, "url": url, **r})
        ok = r.get("ok", False)
        status = r.get("status")
        snippet = r.get("body", "")[:400].replace("\n", " ")
        if ok:
            print(f"  => HTTP {status} OK")
            print(f"     body: {snippet}")
        else:
            print(f"  => HTTP {status} FAIL")
            print(f"     error: {r.get('error', '')}")
            print(f"     body: {snippet}")

    # 3) Summary verdict
    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    any_ok = any(r.get("ok") for r in results)
    provisioning_ok = results[0].get("ok")
    print(f"At least one endpoint OK: {any_ok}")
    print(f"Provisioning API list accounts OK: {provisioning_ok}")
    if provisioning_ok:
        print("\n>>> UPDATE .env with this token and re-deploy — provisioning works.")
    elif any_ok:
        print("\n>>> Token is valid for SOME endpoints but NOT provisioning. "
              "Need to check whether the trading-account-management-api grants "
              "access to /users/current/accounts on the provisioning host.")
    else:
        print("\n>>> Token is REJECTED on every endpoint — same failure mode as v1/v2/v3. "
              "Likely an account-level lock at MetaApi; user must check "
              "https://app.metaapi.cloud dashboard.")

if __name__ == "__main__":
    main()
