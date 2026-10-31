@echo off
title Stop POS Print Agent (Branch 1)
taskkill /f /im branch1-agent.exe
echo.
echo [OK] Branch 1 Print Agent stopped.
pause
