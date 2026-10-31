@echo off
title Stop POS Print Agent (Branch 2)
taskkill /f /im branch2-agent.exe
echo.
echo [OK] Branch 2 Print Agent stopped.
pause
