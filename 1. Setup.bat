@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
echo EXP Chest Opener SETUP
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is NOT installed.
    echo.
    set /p confirm="  Do you want to download and install Node.js? (y/n): "
    if /i not "!confirm!"=="y" (
        echo.
        echo Setup cancelled.
        echo You need Node.js to run this program.
        echo Download it manually from: https://nodejs.org
        pause
        exit /b 1
    )
    echo.
    echo Downloading Node.js installer...
    echo.
    
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.19.4/node-v20.19.4-x64.msi' -OutFile '%TEMP%\node_install.msi'"
    
    if not exist "%TEMP%\node_install.msi" (
        echo Download failed!
        echo Please download Node.js manually from: https://nodejs.org
        pause
        exit /b 1
    )
    
    echo Installing Node.js...
    echo Please click YES if you see a permission prompt.
    echo.
    
    msiexec /i "%TEMP%\node_install.msi" /passive /norestart
    
    del "%TEMP%\node_install.msi" >nul 2>nul
    
    echo.
    echo Node.js installed!
    echo.
    echo [*] You need to CLOSE this window and run setup again.
    echo [*] This is needed to refresh the system PATH.
    echo.
    pause
    exit /b 0
)
echo Node.js found!
echo.
echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [*] npm install failed!
    pause
    exit /b 1
)
call npm install debug
echo.
echo.
echo [*] Setup Complete!
echo [*] You can now run "Start Chest Opener.bat"
echo.

pause
