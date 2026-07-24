#!/usr/bin/env python3
"""Probe different CopyFactory region subdomains."""
import ssl
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTAyMjMsImV4cCI6MTc5MjY4NjIyM30.aa5bZ8ZJAPT_SHQFs6QRyP3QoFIzxGKLgyP1fdYGh1m2UuT_hHOd2Zmg-Xzy81HQI-do4JWWAB9fEU6jpM14BQrePLowIDXFOKZvpdPJM5UDVTp_cagDOp2nAIxme_ML9Hwn9JIMzX-FG_ZSiqSglyqq-A8EHXjdZBup3YFPKHNndEKrgVuw6P_61Q4CbeOcofHLey-XUhfn8DzVHBSv-PlOV6oVgKvKm5Gib2bKquDF7UF1HBeolVBKd6PiSuPLqjKg_AkOioziSpai_PbyzTs8WOk4ZYhxCPG8xi3cOLKG8i_6zSD2lx6JGZzuNdu4lD6jLhawBDVancbCP9_6SO6YmxgNH2ovMuan7uFpoeqhCDCRbjj45x3bdjRJZtvgfzK2EPhFiqe1w6PEZvaB5jFy8qge8M7JxLTAIi-Xi4lEcZJgGcnkdBMhMqleYy5P97GHpgmWShMm14VFHi2Ck5tXQclGFP9n3Uo5OWkczbUCXAtMMpJ-Z4XCr0cl0koSm86wNhb1kiTSC6ceLW9e_ra3C5uIoyFY4AquP--vCb1qRiwmR_Qm6N5nwd4BbluU83SZ0P65MmGgtSd40dGeaFBcN_CsqLtevlgDzgjp0TE1TPkP2SXXLNwp57q6_JIZ04NYPieP7IyGAzJW0L9vycyU8HzbMvXpPMQLc0JuT5o"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

regions = ["new-york", "vint-hill", "london", "hong-kong", "singapore", "tokyo", "ireland"]
domains = ["agiliumtrade.ai", "agiliumtrade.agiliumtrade.ai", "metaapi.cloud"]

# 1. Try to fetch the dynamic client domain from provisioning API
#    (this might 401 because provisioning is missing, but let's confirm)
print("=" * 70)
print("Attempt: GET /users/current/servers/mt-client-api (provisioning API)")
req = Request(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/servers/mt-client-api",
    headers={"auth-token": TOKEN}
)
try:
    with urlopen(req, context=ctx, timeout=10) as resp:
        print(f"HTTP {resp.status}")
        print(f"body: {resp.read().decode('utf-8')[:300]}")
except HTTPError as e:
    print(f"HTTP {e.code} {e.reason}")
    print(f"body: {e.read().decode('utf-8')[:300]}")
except Exception as e:
    print(f"Error: {e}")

# 2. Brute force all CopyFactory URL combos
print()
print("=" * 70)
print("CopyFactory URL probe (all region x domain combos):")
for region in regions:
    for domain in domains:
        url = f"https://copyfactory-api-v1.{region}.{domain}/users/current/configuration/strategies"
        req = Request(url, headers={"auth-token": TOKEN})
        try:
            with urlopen(req, context=ctx, timeout=8) as resp:
                body = resp.read().decode("utf-8", errors="replace")[:200]
                print(f"  HTTP {resp.status}  {url}")
                print(f"    body: {body}")
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:120]
            if "nginx" in body:
                marker = "nginx-404"
            elif "UnauthorizedError" in body:
                marker = "401-UNAUTHORIZED"
            elif "NotFound" in body:
                marker = "API-404"
            else:
                marker = f"HTTP{e.code}"
            print(f"  {marker:25s}  {url}")
        except Exception as e:
            err = str(e)[:60]
            print(f"  ERROR-{err:20s}  {url}")

# 3. Also try the metaapi.cloud domain pattern (newer MetaApi branding)
print()
print("=" * 70)
print("Try metaapi.cloud domain (newer branding):")
for region in regions:
    url = f"https://copyfactory-api-v1.{region}.metaapi.cloud/users/current/configuration/strategies"
    req = Request(url, headers={"auth-token": TOKEN})
    try:
        with urlopen(req, context=ctx, timeout=8) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:200]
            print(f"  HTTP {resp.status}  {url}")
            print(f"    body: {body}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:120]
        if "nginx" in body:
            marker = "nginx-404"
        elif "UnauthorizedError" in body:
            marker = "401-UNAUTHORIZED"
        elif "NotFound" in body:
            marker = "API-404"
        else:
            marker = f"HTTP{e.code}"
        print(f"  {marker:25s}  {url}")
    except Exception as e:
        err = str(e)[:60]
        print(f"  ERROR-{err:20s}  {url}")
