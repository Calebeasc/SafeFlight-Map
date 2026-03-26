Start-Process powershell -ArgumentList "-NoExit","-Command","cd scanner-map/backend; uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd scanner-map/frontend; npm run dev -- --host 127.0.0.1 --port 5173"
Start-Process "http://127.0.0.1:5173"
