$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
$example = Join-Path $root ".env.example"

if (Test-Path $envFile) {
    Write-Host ".env already exists: $envFile"
    Write-Host "Edit SMTP_PASS with Gmail app password, then: npm start"
    exit 0
}

if (-not (Test-Path $example)) {
    Write-Host ".env.example not found"
    exit 1
}

Copy-Item $example $envFile
Write-Host "Created: $envFile"
Write-Host "1. Open .env and set SMTP_PASS (Gmail app password)"
Write-Host "2. npm run test:mail"
Write-Host "3. npm start"
