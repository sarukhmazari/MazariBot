Write-Host "🚀 Pushing MazariBot code to GitHub..." -ForegroundColor Green
Write-Host ""

Write-Host "📋 Instructions:" -ForegroundColor Yellow
Write-Host "1. Enter your GitHub username when prompted"
Write-Host "2. For password, use a Personal Access Token (NOT your GitHub password)"
Write-Host "3. If you don't have a token, create one at: https://github.com/settings/tokens"
Write-Host ""

Write-Host "🔑 Creating Personal Access Token:" -ForegroundColor Cyan
Write-Host "- Go to: https://github.com/settings/tokens"
Write-Host "- Click 'Generate new token (classic)'"
Write-Host "- Select 'repo' permissions"
Write-Host "- Copy the token and use it as password"
Write-Host ""

Read-Host "Press Enter when ready to push..."

Write-Host "📤 Pushing code now..." -ForegroundColor Green
git push origin main

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Code pushed successfully!" -ForegroundColor Green
    Write-Host "🌐 Your GitHub Pages will be deployed automatically!" -ForegroundColor Green
    Write-Host "🔗 Visit: https://sarukhmazari.github.io/MazariBot/" -ForegroundColor Cyan
} else {
    Write-Host "❌ Push failed. Check the error above." -ForegroundColor Red
}

Read-Host "Press Enter to exit..."
