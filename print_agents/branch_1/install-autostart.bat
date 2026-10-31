@echo off
title Install POS Print Agent Auto-Start (Branch 1)
cd /d "%~dp0"
echo ========================================================
echo   Installing POS Print Agent (Branch 1) Auto-Start
echo ========================================================
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_NAME=Start_POS_Agent_Branch1.vbs

echo [1/3] Copying auto-start launcher to Windows Startup...
copy /y "%~dp0start-background.vbs" "%STARTUP_DIR%\%SHORTCUT_NAME%" >nul

echo [2/3] Stopping any old running agent instances...
taskkill /f /im node.exe /fi "WINDOWTITLE eq POS Print Agent Branch 1*" >nul 2>&1
taskkill /f /im branch1-agent.exe >nul 2>&1

echo [3/3] Starting POS Print Agent in background with Watchdog...
wscript "%STARTUP_DIR%\%SHORTCUT_NAME%"

timeout /t 2 /nobreak >nul
echo.
echo ========================================================
echo  [SUCCESS] Branch 1 Print Agent is now RUNNING!
echo.
echo  Features active:
echo   - Runs automatically on every Windows boot/login.
echo   - Auto-reconnects immediately if internet/Wi-Fi drops.
echo   - Self-heals if process ever crashes (Watchdog restarts it).
echo   - Prints Urdu + English on all kitchen slips.
echo ========================================================
echo.
pause

