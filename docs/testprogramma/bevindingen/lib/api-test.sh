#!/usr/bin/env bash
# Hulpfuncties voor API-niveau testgevallen (SEC-xx en negatieve statuscode-tests).
#
# LET OP: draai dit met BASH, niet zsh (de default shell hier is zsh en die
# behandelt de `local args=(...)`-arrays anders). Dus:
#   bash -c 'source docs/testprogramma/bevindingen/lib/api-test.sh; check SEC-03 403 POST ...'
#
# API draait op :3001 met NODE_ENV=test (throttle uit).
# TenantMiddleware eist een Host-header met het org-subdomein.

API="http://localhost:3001/api/v1"
PW='Password123!'

# login <email> <slug>  -> echoot het accessToken (leeg bij falen)
login() {
  local email="$1" slug="$2"
  curl -s -m 10 -X POST \
    -H "Host: ${slug}.localhost" -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${PW}\"}" \
    "${API}/auth/login" \
  | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get("data",{}).get("accessToken","") if d.get("success") else "")
except Exception:
    print("")'
}

# req <method> <slug> <path> [token] [json-body] -> echoot "<status>\t<body-eerste-300-tekens>"
req() {
  local method="$1" slug="$2" path="$3" token="${4:-}" body="${5:-}"
  local args=(-s -m 15 -o /tmp/claude-501/_resp.txt -w '%{http_code}'
              -X "$method" -H "Host: ${slug}.localhost")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer ${token}")
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  local code
  code=$(curl "${args[@]}" "${API}${path}")
  printf '%s\t%s\n' "$code" "$(head -c 300 /tmp/claude-501/_resp.txt)"
}

# check <test-id> <verwachte-status(sen), bv "403" of "403|404"> <method> <slug> <path> [token] [body]
# Print één logboekregel: "ID | PASS/FAIL | <status> <melding>"
check() {
  local id="$1" expect="$2"; shift 2
  local out status bodytxt verdict
  out=$(req "$@")
  status="${out%%$'\t'*}"
  bodytxt="${out#*$'\t'}"
  if [[ "$status" =~ ^(${expect})$ ]]; then verdict=PASS; else verdict=FAIL; fi
  # 500 is altijd fout, ongeacht verwachting
  [ "$status" = "500" ] && verdict=FAIL
  printf '%s | %s | HTTP %s (verwacht %s) — %s\n' \
    "$id" "$verdict" "$status" "$expect" "$(echo "$bodytxt" | tr -d '\n' | head -c 160)"
}

mkdir -p /tmp/claude-501
