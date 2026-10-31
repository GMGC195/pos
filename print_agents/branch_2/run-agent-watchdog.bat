@echo off
setlocal
cd /d "%~dp0"
title POS Print Agent Branch 1 - Watchdog

:loop
echo ========================================================
echo [%DATE% %TIME%] Starting POS Print Agent (Branch 1)...
echo ========================================================
node agent.js
echo.
echo [%DATE% %TIME%] [WARNING] POS Print Agent stopped or disconnected!
echo [%DATE% %TIME%] Auto-restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
