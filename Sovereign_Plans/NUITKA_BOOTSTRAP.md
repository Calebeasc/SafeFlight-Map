# Nuitka C-Level Compilation Bootstrap

We have pivoted from PyInstaller to **Nuitka**. Instead of "zipping" scripts, we are now compiling Python directly into a native C++ Windows machine-code binary.

### 🛠 Installation
Run these commands in your Admin PowerShell:
```powershell
# 1. Install Nuitka
pip install nuitka

# 2. Install Zstandard (for faster compilation compression)
pip install zstandard
```

### 🚀 Compilation Directive
To build the true standalone executable:
```powershell
python -m nuitka --standalone --onefile --assume-yes-for-downloads `
  --plugin-enable=tk-inter --plugin-enable=webview `
  --include-data-dir=frontend/dist=frontend `
  src/app/main.py
```

### 📦 Compiler Setup
Nuitka requires a C compiler. On the first run, it will ask to download **MinGW64**. Type `Yes` when prompted. If the build fails due to memory limits, add `--jobs=1` to the command.
