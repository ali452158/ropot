#!/bin/bash
# Try the EXACT request the SDK would send, with explicit verbose curl

TOKEN="eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOm10LWFjY291bnQtZ2VuZXJhdG9yOmNyZWF0ZU1UNURlbW9BY2NvdW50IiwidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOmFjY291bnQtbWFuYWdlbWVudDpjcmVhdGVBY2NvdW50Il0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sInRva2VuSWQiOiIyMDIxMDIxMyJ9.FAKE"

echo "=== TEST 1: Curl with auth-token header (verbose, no SSL verify) ==="
curl -sk -v \
  -H "auth-token: $TOKEN" \
  -H "Accept: application/json" \
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts" 2>&1 | tail -30
