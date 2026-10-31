@echo off
title Check Status - POS Print Agent (Branch 2)
tasklist /fi "imagename eq branch2-agent.exe"
echo.
echo If branch2-agent.exe is listed above, the agent is running!
pause
