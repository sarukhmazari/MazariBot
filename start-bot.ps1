# Mazari Bot - WhatsApp Pairing Mode
# PowerShell Startup Script

Clear-Host

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║           🤖 MAZARI BOT 🤖              ║" -ForegroundColor Magenta
Write-Host "║        WhatsApp Pairing Mode             ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "📱 Starting WhatsApp Bot in Pairing Mode..." -ForegroundColor Cyan
Write-Host "🔐 You will be prompted to enter your phone number" -ForegroundColor Yellow
Write-Host "📋 A pairing code will be generated for WhatsApp" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  Make sure to run this in PowerShell or Command Prompt" -ForegroundColor Red
Write-Host "💡 Don't double-click the .js file directly" -ForegroundColor Red
Write-Host ""
Write-Host "🚀 Starting Mazari Bot..." -ForegroundColor Green
Write-Host ""

# Start the bot
node index.js

Write-Host ""
Write-Host "Bot has stopped. Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
