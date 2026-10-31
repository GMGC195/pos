@echo off
title POS Print Agent Status (Branch 1)
cd /d "%~dp0"
echo ========================================================
echo         POS PRINT AGENT (BRANCH 1) - LIVE STATUS
echo ========================================================
echo.
echo [1] Checking running processes...
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo     [OK] Node.js Print Agent is RUNNING.
) else (
    echo     [WARNING] Print Agent is NOT running!
    echo     Double-click 'install-autostart.bat' to start it.
)
echo.
echo [2] Recent Log entries (last 15 lines):
echo --------------------------------------------------------
if exist "agent.log" (
    powershell -Command "Get-Content agent.log -Tail 15"
) else (
    echo     No log file found yet. Run 'run-agent-watchdog.bat' or 'install-autostart.bat'.
)
echo --------------------------------------------------------
echo.
pause
