#!/usr/bin/env python3
"""Try the OFFICIAL metaapi.cloud SDK URLs (newer branding)."""
import ssl, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTAyMjMsImV4cCI6MTc5MjY4NjIyM30.aa5bZ8ZJAPT_SHQFs6QRyP3QoFIzxGKLgyP1fdYGh1m2UuT_hHOd2Zmg-Xzy81HQI-do4JWWAB9fEU6jpM14BQrePLowIDXFOKZvpdPJM5UDVTp_cagDOp2nAIxme_ML9Hwn9JIMzX-FG_ZSiqSglyqq-A8EHXjdZBup3YFPKHNndEKrgVuw6P_61Q4CbeOcofHLey-XUhfn8DzVHBSv-PlOV6oVgKvKm5Gib2bKquDF7UF1HBeolVBKd6PiSuPLqjKg_AkOioziSpai_PbyzTs8WOk4ZYhxCPG8xi3cOLKG8i_6zSD2lx6JGZzuNdu4lD6jLhawBDVancbCP9_6SO6YmxgNH2ovMuan7uFpoeqhCDCRbjj45x3bdjRJZtvgfzK2EPhFiqe1w6PEZvaB5jFy8qge8M7JxLTAIi-Xi4lEcZJgGcnkdBMhMqleYy5P97GHpgmWShMm14VFHi2Ck5tXQclGFP9n3Uo5OWkczbUCXAtMMpJ-Z4XCr0cl0koSm86wNhb1kiTSC6ceLW9e_ra3C5uIoyFY4AquP--vCb1qRiwmR_Qm6N5nwd4BbluU83SZ0P65MmGgtSd40dGeaFBcN_CsqLtevlgDzgjp0TE1TPkP2SXXLNwp57q6_JIZ04NYPieP7IyGAzJW0L9vycyU8HzbMvXpPMQLc0JuT5o"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(url, label):
    print(f"\n--- {label} ---")
    print(f"GET {url}")
    req = Request(url, headers={"auth-token": TOKEN})
    try:
        with urlopen(req, context=ctx, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"HTTP {resp.status}")
            try:
                j = json.loads(body)
                print(f"JSON: {json.dumps(j, indent=2)[:500]}")
            except:
                print(f"body[:500]: {body[:500]}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}")
        print(f"body[:300]: {body[:300]}")
    except Exception as e:
        print(f"Error: {e}")

# Try the METAAPI.CLOUD OFFICIAL domain for the provisioning API
probe(
    "https://api.metaapi.cloud/provisioning-api/v1/users/current/accounts",
    "METAAPI.CLOUD: provisioning-api/v1",
)
probe(
    "https://api.metaapi.cloud/provisioning-api/v2/users/current/accounts",
    "METAAPI.CLOUD: provisioning-api/v2",
)
probe(
    "https://api.metaapi.cloud/users/current/accounts",
    "METAAPI.CLOUD: bare /users/current/accounts",
)

# Also try the official SDK URL for client API
probe(
    "https://api.metaapi.cloud/metaapi-api/v1/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346/account-information",
    "METAAPI.CLOUD: metaapi-api/v1 account-information",
)

# CopyFactory via metaapi.cloud
probe(
    "https://api.metaapi.cloud/copyfactory-api/v1/users/current/configuration/strategies",
    "METAAPI.CLOUD: copyfactory-api/v1 strategies",
)

# Try the vint-hill region specifically (the SDK default)
probe(
    "https://mt-client-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346/account-information",
    "CLIENT API vint-hill: account-information",
)

# Try the master login specifically via mt-manager-api path
probe(
    "https://mt-manager-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/accounts/fe905f8a-387a-4051-bf87-f818ae139346/account-information",
    "MANAGER API: account-information (master)",
)

# Try the trade copier API directly
probe(
    "https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    "COPYFACTORY vint-hill full domain",
)
