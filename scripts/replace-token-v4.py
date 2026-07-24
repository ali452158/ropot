#!/usr/bin/env python3
"""Replace the old MetaApi JWT token (v3) with the new working token (v4)
in .env, deploy-hostinger.sh, and scripts/deploy-vps.sh.

Strategy: read each file, find any line that starts with `META_API_TOKEN=eyJ`
(or any `META_API_TOKEN=eyJ...` substring on a line), and replace the token
value with the new v4 token. We do this carefully because the token is
very long (~5800 chars) and appears both as a standalone assignment and
inside a `grep -q "^META_API_TOKEN=eyJ..."` heredoc check.
"""
import re
import sys
from pathlib import Path

# v4 token — confirmed working against the live MetaApi provisioning API
NEW_TOKEN = (
    "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9."
    "eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwidHJhY2tlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDoqZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3RyYXRlZ3k6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiIsInBvcnRmb2xpbzokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3Vic2NyaWJlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LW1hbmFnZXI6JFVTRVJfSUQkOipmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1hY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1ncm91cDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTMwOTUsImV4cCI6MTc5MjY4OTA5NX0."
    "R5QcAmFPrBwJG66st7VBTwm4RjYRDD0isp0xDAXMQ4XLn62IucsuFgI2FiYkm6ARAQ01lJz-LVSPabd3ffBgrM2kVJ1Dp37ah41KlRfD512rrxiuK2DfqfdAUTq6LziW9RbUQ0Hn0Z7JhGuy8jAiw_Ef7T-AKRzlPH2sTCjyrXR89vhID6niS8bYiqQUOBenaYUehBItsMMg0YLJtzPfgTxIzd_PaRcQ0TwdTThp870oD4HvIa_gacU5oNTbDXhDHiV-BWYyx7RyWmt7QlnMqxAPcDemPoC920eeiJhqv20U9QBmse--QC5Us0WNiFSd8AzV3-xSQfVVF69y_1vpnbHXKfHDhhGnSCdY0GP2NqDfQ82yQ4WNgJ8qX0ssgmmGoH-jcAu4Qi2d6QpRk-Scojq26N3TG3CrIGowy8EIFjHarSwbpuI6IqoJmKi2MasaENLgRUp54BigeO0V1s0VNvT--DKqstK3i1alxa8w6IGMPCUno4_0XFEEsexm8F3aA_dkIJ7ONpSlBTCGHgKavGD0bLxedRZhNIEt4QRbCV53yTZ9qtb1lV4JufqtowyxKq4o1f3NLEMA-UVRt93PCQgx_SSTwt2e1tPNxcdV_vOdv0CXP0DkjIxu6XYtK5XD_P724TbUVro8bh7b534N_3SDUvsqwRoZWqcaJ9yqiNw"
)

# Match any JWT-style token after `META_API_TOKEN=` (heredoc, env file, or grep -q pattern).
# JWT shape: header.payload.signature, all base64url, three parts separated by dots.
# We intentionally do NOT require a specific token body — we just match the longest
# eyJ...signature on the line.
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
    if n > 0:
        p.write_text(new_text)
        print(f"[ok]   {path}: replaced {n} occurrence(s)")
    else:
        print(f"[noop] {path}: no META_API_TOKEN match found")
    return n

def main():
    total = 0
    for f in FILES:
        total += patch(f)
    print(f"\nTotal replacements: {total}")
    if total == 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
