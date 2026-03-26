# scanner-map

## Windows setup (exact commands)

```powershell
cd scanner-map
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e backend
```

Run backend:

```powershell
cd scanner-map
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --app-dir backend/src --host 127.0.0.1 --port 8000
```

Run frontend (dev):

```powershell
cd scanner-map/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Build frontend:

```powershell
cd scanner-map/frontend
npm install
npm run build
```

Desktop wrapper:

```powershell
cd scanner-map
.\.venv\Scripts\Activate.ps1
python desktop/app.py
```

Single EXE build:

```powershell
powershell -ExecutionPolicy Bypass -File scanner-map/scripts/build.ps1
```
