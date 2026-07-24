import base64, json

token = "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImN3b3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkwMTU0MywiZXhwIjoxNzkyNjc3NTQzfQ"

# Fix padding
def b64decode_safe(s):
    s += '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

header_b64, payload_b64 = token.split('.')[0], token.split('.')[1]
header = json.loads(b64decode_safe(header_b64))
payload = json.loads(b64decode_safe(payload_b64))

print("=== HEADER ===")
print(json.dumps(header, indent=2))
print("\n=== PAYLOAD ===")
print(json.dumps(payload, indent=2))

print("\n=== PERMISSIONS SUMMARY ===")
for rule in payload.get('accessRules', []):
    roles = ', '.join(rule.get('roles', []))
    resources = rule.get('resources', [])
    print(f"{rule['id']:40} | roles: {roles:30} | resources: {resources}")

print(f"\nToken ID: {payload.get('tokenId')}")
print(f"Issued (iat): {payload.get('iat')} ({__import__('datetime').datetime.utcfromtimestamp(payload.get('iat')).isoformat()})")
print(f"Expires (exp): {payload.get('exp')} ({__import__('datetime').datetime.utcfromtimestamp(payload.get('exp')).isoformat()})")
print(f"User ID: {payload.get('_id')}")
