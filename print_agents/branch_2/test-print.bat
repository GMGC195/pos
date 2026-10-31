@echo off
title POS Print Agent - Test Print (Branch 1)
cd /d "%~dp0"
echo ========================================================
echo     Sending Test Bilingual (Urdu + English) Slip
echo ========================================================
echo.
node test-print.js
echo.
pause
