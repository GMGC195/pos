@echo off
title Stop POS Print Agent (Branch 1)
cd /d "%~dp0"
echo Stopping POS Print Agent (Branch 1)...

taskkill /f /im node.exe /fi "WINDOWTITLE eq POS Print Agent Branch 1*" >nul 2>&1
taskkill /f /im cmd.exe /fi "WINDOWTITLE eq POS Print Agent Branch 1*" >nul 2>&1
taskkill /f /im branch1-agent.exe >nul 2>&1

echo [OK] Branch 1 Agent stopped.
pause

