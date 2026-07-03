Write-Host "=== CondoBot - Setup ===" -ForegroundColor Cyan
Write-Host ""

# Verifica Node.js
try {
    $nodeVer = node --version
    Write-Host "Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "Node.js nao encontrado! Instale em: https://nodejs.org" -ForegroundColor Red
    Start-Process "https://nodejs.org"
    exit 1
}

# Instala dependencias
Write-Host "Instalando dependencias..." -ForegroundColor Yellow
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao instalar dependencias!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "Setup concluido!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o CondoBot, execute:"
Write-Host "  npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "Depois acesse: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Login: admin / admin123" -ForegroundColor Cyan
pause
