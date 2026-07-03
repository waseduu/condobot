Set WshShell = CreateObject("WScript.Shell")
Set oShortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") & "\CondoBot.lnk")
oShortcut.TargetPath = WshShell.ExpandEnvironmentStrings("%windir%\system32\wscript.exe")
oShortcut.Arguments = """" & WScript.CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".") & "\launcher.vbs"""
oShortcut.WorkingDirectory = "."
oShortcut.Description = "CondoBot - Gestão da Associação"
oShortcut.IconLocation = """%windir%\system32\imageres.dll"", 110"
oShortcut.WindowStyle = 1
oShortcut.Save
MsgBox "Atalho do CondoBot criado na Área de Trabalho!", 64, "CondoBot"
