Set WshShell = CreateObject("WScript.Shell")
strPath = WScript.ScriptFullName
strFolder = Left(strPath, InStrRev(strPath, "\"))
WshShell.CurrentDirectory = strFolder
WshShell.Run chr(34) & strFolder & "run-agent-watchdog.bat" & chr(34), 0, False
