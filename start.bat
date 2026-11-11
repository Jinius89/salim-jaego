@echo off
rem Double-click to run the app on this PC (http://localhost:5173)
rem Close this window to stop the app.
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:5173"
node tools\serve.js
pause
