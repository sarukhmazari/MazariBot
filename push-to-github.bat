@echo off
echo Pushing MazariBot code to GitHub...
echo.
echo Please follow these steps:
echo 1. Enter your GitHub username when prompted
echo 2. For password, use a Personal Access Token (not your GitHub password)
echo 3. If you don't have a token, go to: https://github.com/settings/tokens
echo.
echo Creating Personal Access Token:
echo - Go to: https://github.com/settings/tokens
echo - Click "Generate new token (classic)"
echo - Select "repo" permissions
echo - Copy the token and use it as password
echo.
pause
echo.
echo Pushing code now...
git push origin main
echo.
echo If successful, your GitHub Pages will be deployed automatically!
echo Visit: https://sarukhmazari.github.io/MazariBot/
pause
