@echo off
title Check Status - POS Print Agent (Branch 1)
tasklist /fi "imagename eq branch1-agent.exe"
echo.
echo If branch1-agent.exe is listed above, the agent is running!
pause
