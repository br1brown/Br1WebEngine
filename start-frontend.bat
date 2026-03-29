@echo off
setlocal

cd /d "%~dp0frontend"

if not exist package.json (
    echo [frontend] Cartella frontend non trovata.
    exit /b 1
)

echo [frontend] Avvio Angular...
start "Angular Dev Server" cmd /k "npm start"

exit /b 0
