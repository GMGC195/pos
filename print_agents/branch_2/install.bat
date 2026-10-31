@echo off
title POS Print Agent - Branch 2 Installer
cd /d "%~dp0"

set AGENT_DIR=%~dp0
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

echo ========================================================
echo       POS Print Agent - Branch 2 Auto-Start Setup
echo ========================================================
echo.

echo [1/3] Stopping any old running instances...
taskkill /f /im branch2-agent.exe >nul 2>&1

echo [2/3] Setting up Windows Startup auto-launch...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%AGENT_DIR%"
echo WshShell.Run chr^(34^) ^& "%AGENT_DIR%branch2-agent.exe" ^& chr^(34^), 0, False
) > "%STARTUP_DIR%\POSAgent_Branch2.vbs"

echo [3/3] Starting Branch 2 Print Agent in background...
wscript "%STARTUP_DIR%\POSAgent_Branch2.vbs"

timeout /t 2 /nobreak >nul
echo.
echo ========================================================
echo  [SUCCESS] Branch 2 Print Agent is now ACTIVE!
echo.
echo  - Runs 24/7 silently in the background.
echo  - Auto-starts whenever Windows turns on.
echo  - Automatically reconnects if Wi-Fi / Internet drops.
echo ========================================================
echo.
pause
