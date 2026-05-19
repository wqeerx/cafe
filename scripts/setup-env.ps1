# Создаёт .env из шаблона, если файла ещё нет
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
$example = Join-Path $root ".env.example"

if (Test-Path $envFile) {
    Write-Host ".env уже существует: $envFile"
    Write-Host "Откройте его и укажите SMTP_PASS (пароль приложения Gmail)."
    exit 0
}

if (-not (Test-Path $example)) {
    Write-Host "Не найден .env.example"
    exit 1
}

Copy-Item $example $envFile
Write-Host "Создан $envFile"
Write-Host ""
Write-Host "Дальше:"
Write-Host "1. Откройте https://myaccount.google.com/apppasswords"
Write-Host "2. Создайте пароль приложения для zerno.coffee.by@gmail.com"
Write-Host "3. Вставьте его в .env в строку SMTP_PASS= (можно с пробелами)"
Write-Host "4. Перезапустите сервер: npm start"
Write-Host "5. Проверка: node scripts/test-mail.js"
