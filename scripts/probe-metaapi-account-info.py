#!/usr/bin/env python3
"""
Probe alternative MetaApi endpoints that DO work with the new token
(even though provisioning-api doesn't), to figure out a workaround.

The new token HAS:
- metaapi-rest-api (writer, ALL accounts)
- metaapi-rpc-api (writer, ALL accounts)
- mt-manager-api (writer, ALL accounts)
- copyfactory-api (writer, ALL resources)

So we can READ the master account info, and we CAN use CopyFactory.
The question: can we use mt-manager-api or copyfactory-api to drive
trades WITHOUT provisioning a new MetaApi account for each subscriber?

Approach: Use CopyFactory as the trade-execution layer instead of
provisioning individual MetaApi accounts per subscriber. Subscribers
create their OWN MetaApi account (free tier, they do it themselves
from app.metaapi.cloud), then connect their account to our CopyFactory
strategy via a Subscriber.

This way OUR token doesn't need provisioning-api at all — subscribers
do the provisioning on their own MetaApi user.
"""
import json, ssl, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

NEW_TOKEN = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTAyMjMsImV4cCI6MTc5MjY4NjIyM30.aa5bZ8ZJAPT_SHQFs6QRyP3QoFIzxGKLgyP1fdYGh1m2UuT_hHOd2Zmg-Xzy81HQI-do4JWWAB9fEU6jpM14BQrePLowIDXFOKZvpdPJM5UDVTp_cagDOp2nAIxme_ML9Hwn9JIMzX-FG_ZSiqSglyqq-A8EHXjdZBup3YFPKHNndEKrgVuw6P_61Q4CbeOcofHLey-XUhfn8DzVHBSv-PlOV6oVgKvKm5Gib2bKquDF7UF1HBeolVBKd6PiSuPLqjKg_AkOioziSpai_PbyzTs8WOk4ZYhxCPG8xi3cOLKG8i_6zSD2lx6JGZzuNdu4lD6jLhawBDVancbCP9_6SO6YmxgNH2ovMuan7uFpoeqhCDCRbjj45x3bdjRJZtvgfzK2EPhFiqe1w6PEZvaB5jFy8qge8M7JxLTAIi-Xi4lEcZJgGcnkdBMhMqleYy5P97GHpgmWShMm14VFHi2Ck5tXQclGFP9n3Uo5OWkczbUCXAtMMpJ-Z4XCr0cl0koSm86wNhb1kiTSC6ceLW9e_ra3C5uIoyFY4AquP--vCb1qRiwmR_Qm6N5nwd4BbluU83SZ0P65MmGgtSd40dGeaFBcN_CsqLtevlgDzgjp0TE1TPkP2SXXLNwp57q6_JIZ04NYPieP7IyGAzJW0L9vycyU8HzbMvXpPMQLc0JuT5o"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(url, label):
    print(f"\n--- {label} ---")
    print(f"GET {url}")
    req = Request(url, headers={"auth-token": NEW_TOKEN})
    try:
        with urlopen(req, context=ctx, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"HTTP {resp.status}")
            print(f"body[:600]: {body[:600]}")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}")
        print(f"body: {body[:400]}")
    except Exception as e:
        print(f"Error: {e}")

# 1. Provisioning API (known to fail — but let's confirm)
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    "PROVISIONING API: list accounts (should 401)",
)

# 2. Manager API: trade on master account (already works with the OLD token's
#    metaapi-rest-api, but the new token has ALL scope so should work too)
MASTER_ACCOUNT_ID = "fe905f8a-387a-4051-bf87-f818ae139346"
probe(
    f"https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts/{MASTER_ACCOUNT_ID}/account-information",
    "CLIENT API (master): get account info (should 200)",
)

# 3. Try to discover what /users/current/accounts does on the CLIENT API
#    (it's a different host — maybe listing works there?)
probe(
    f"https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts",
    "CLIENT API: list accounts (try — might 404)",
)

# 4. Try the trading-account-management-api endpoint
#    (this API was added in the new token and might list/manage MT accounts)
probe(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/mt-accounts",
    "TRADING ACCOUNT MANAGEMENT API: list mt-accounts (try)",
)

# 5. CopyFactory: list strategies
probe(
    "https://copyfactory-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/configuration/strategies",
    "COPYFACTORY API: list strategies",
)

# 6. CopyFactory: list subscribers
probe(
    "https://copyfactory-api-v1.new-york.agiliumtrade.agiliumtrade.ai/users/current/configuration/subscribers",
    "COPYFACTORY API: list subscribers",
)
