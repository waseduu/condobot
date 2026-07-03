Set oShell = CreateObject("Wscript.Shell")
sCurDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")
oShell.CurrentDirectory = sCurDir

' Inicia o servidor sem janela de terminal
oShell.Run "cmd /c node server.js", 0, False

' Aguarda e abre o navegador
WScript.Sleep 3000
oShell.Run "http://localhost:3000", 1, False
