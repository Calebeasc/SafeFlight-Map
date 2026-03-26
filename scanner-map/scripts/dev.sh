#!/usr/bin/env bash
set -e
(cd scanner-map/backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
(cd scanner-map/frontend && npm run dev -- --host 127.0.0.1 --port 5173) &
