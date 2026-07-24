#!/usr/bin/env python3
"""Replace old MetaApi JWT token with v6 in .env, deploy-hostinger.sh, and
scripts/deploy-vps.sh. Also update META_API_MASTER_LOGIN (new master) and
COPYFACTORY_STRATEGY_ID (new master account ID).
"""
import re
import sys
from pathlib import Path

# v6 token — best so far (CopyFactory ALL + MT Manager ALL + billing ALL)
NEW_TOKEN = (
    "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9."
    "eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIiwiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOjg2Y2RlYmVjLWVhMjUtNGUwNy1hMjA4LTY5YzAwNDhkZDRmZCJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDo4NmNkZWJlYy1lYTI1LTRlMDctYTIwOC02OWMwMDQ4ZGQ0ZmQiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ODZjZGViZWMtZWEyNS00ZTA3LWEyMDgtNjljMDA0OGRkNGZkIl19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6ImJpbGxpbmctYXBpIiwibWV0aG9kcyI6WyJiaWxsaW5nLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkxODAwNiwiZXhwIjoxNzkyNjk0MDA2fQ."
    "WUdePT_q8p85q0Xri3-Z3wPghlOTRkOvsN0JRd6lXelUClOcPmvc9zFAS3yPntnvuupDdl1U-ORg624pAGZSywFiruBy73eqmQj6kbSPrG8uWPE7gdXptg8jv8LQFauryK2xes_4dqEPlrwLqzdBMBHN-MQzUt68pDILYd3_V7RUt-VqeGrXEUp-7ywS3AEUFAUBHpjwSLTTMFkPzV5KSZrfzjsJ55xSYIDImPlvpzEPTy9EuoayPyaUALPxa0u6Qf-tSL-qnvbbcAV3RdhudzT2JKnNo6r0mhr7B8aSItmaFx_8Pvklri7kr1exfrwbZwWKYHA8l-o5-RK_EWHSQkvqaKbpWyl_L2CNWroXGoxC2qdPjj_KX6NJfmHK3-jtj_2t8aoXFqoDRqWE2zxdlC2ggf0XOBztH9cUbDOz8OrWTdOw-fP6uxpynta-RF9JNDdTrhgspC53lWnt457EuMSa0gJ7mBWzR2lE1L3nBHn4Q-sKJ2UBXkQgZrOg1s1wXu8dxcmO9D5UCb5RLudlv7TsnkjR_W0ppOd64ZpCntHn4QVb7ROh30Fhje8u_bomvz6ya601s0nhW1WDYZN1g12eOyQk-qjImUVfcbhxFqr_BMOczx0sSwdtiEi-dccYzllqKK8Uj7q6zq5jTmx-Z7CTy4gGkE08cPXBKgkNWn4"
)

# Master account info (NEW — switched from fe905f8a-... to 86cdebec-...)
NEW_MASTER_LOGIN = "472266644"  # was 474240052
NEW_COPYFACTORY_STRATEGY_ID = "86cdebec-ea25-4e07-a208-69c0048dd4fd"  # was fe905f8a-387a-4051-bf87-f818ae139346

# Match any JWT-style token after META_API_TOKEN=
JWT_RE = re.compile(r"(META_API_TOKEN=)eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")

FILES = [
    "/home/z/my-project/.env",
    "/home/z/my-project/deploy-hostinger.sh",
    "/home/z/my-project/scripts/deploy-vps.sh",
]

def patch(path: str) -> int:
    p = Path(path)
    if not p.exists():
        print(f"[skip] {path} does not exist")
        return 0
    text = p.read_text()
    n = 0
    def sub(m):
        nonlocal n
        n += 1
        return m.group(1) + NEW_TOKEN
    new_text = JWT_RE.sub(sub, text)

    # Also update META_API_MASTER_LOGIN and COPYFACTORY_STRATEGY_ID
    # Only update if they exist as standalone assignments (not inside comments).
    # Use line-based replacement to avoid touching comment lines.
    lines = new_text.split("\n")
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        # Update META_API_MASTER_LOGIN=<value>
        m = re.match(r"^(META_API_MASTER_LOGIN=)(\S+)(\s*)$", line)
        if m:
            lines[i] = f"{m.group(1)}{NEW_MASTER_LOGIN}{m.group(3)}"
            print(f"  [{path}] updated META_API_MASTER_LOGIN -> {NEW_MASTER_LOGIN}")
            continue
        # Update COPYFACTORY_STRATEGY_ID=<value>
        m = re.match(r"^(COPYFACTORY_STRATEGY_ID=)(\S+)(\s*)$", line)
        if m:
            lines[i] = f"{m.group(1)}{NEW_COPYFACTORY_STRATEGY_ID}{m.group(3)}"
            print(f"  [{path}] updated COPYFACTORY_STRATEGY_ID -> {NEW_COPYFACTORY_STRATEGY_ID}")
            continue
    new_text = "\n".join(lines)

    if n > 0:
        p.write_text(new_text)
        print(f"[ok]   {path}: replaced {n} token occurrence(s)")
    else:
        print(f"[noop] {path}: no META_API_TOKEN match found")
    return n

def main():
    total = 0
    for f in FILES:
        print(f"\n--- Patching {f} ---")
        total += patch(f)
    print(f"\nTotal token replacements: {total}")
    if total == 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
