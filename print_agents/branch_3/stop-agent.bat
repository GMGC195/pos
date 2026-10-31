@echo off
title Stop POS Print Agent (Branch 3)
taskkill /f /im branch3-agent.exe
echo.
echo [OK] Branch 3 Print Agent stopped.
pause
