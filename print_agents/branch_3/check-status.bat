@echo off
title Check Status - POS Print Agent (Branch 3)
tasklist /fi "imagename eq branch3-agent.exe"
echo.
echo If branch3-agent.exe is listed above, the agent is running!
pause
