# CondoBot - Instalação completa
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== CondoBot - Instalação ===" -ForegroundColor Cyan

# 1. Instala Node.js (se não tiver)
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Baixando Node.js..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi" -OutFile "$env:TEMP\node.msi"
    Write-Host "Instalando Node.js..." -ForegroundColor Yellow
    Start-Process msiexec -ArgumentList "/i `"$env:TEMP\node.msi`" /quiet /norestart" -Wait
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    Write-Host "Node.js instalado!" -ForegroundColor Green
}

# 2. Baixa o projeto
Write-Host "Baixando CondoBot..." -ForegroundColor Yellow
$zipUrl = "https://github.com/waseduu/condobot/archive/refs/heads/main.zip"
$zipPath = "$env:TEMP\condobot.zip"
$extractPath = "$env:USERPROFILE\Desktop\condobot"

Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
if (Test-Path "$env:TEMP\condobot-main") {
    Remove-Item $extractPath -Recurse -Force 2>$null
    Move-Item "$env:TEMP\condobot-main" $extractPath
}

# 3. Instala dependências
cd $extractPath
Write-Host "Instalando dependencias..." -ForegroundColor Yellow
npm install --production
if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencias instaladas!" -ForegroundColor Green
}

# 4. Cria atalho
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\CondoBot.lnk")
$shortcut.TargetPath = "$env:SystemRoot\system32\wscript.exe"
$shortcut.Arguments = "`"$extractPath\launcher.vbs`""
$shortcut.WorkingDirectory = "$extractPath"
$shortcut.Save()

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  CondoBot instalado com sucesso!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Clique no atalho 'CondoBot' na Area de Trabalho" -ForegroundColor Yellow
Write-Host "ou acesse a pasta e execute start.bat" -ForegroundColor Yellow
Write-Host ""
Write-Host "Login: admin / admin123" -ForegroundColor Cyan
Write-Host ""
pause
