@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title NUR 4.4 P0 CLEAN - Development

set "URL=http://localhost:1420"
set "APP_NAME=NUR 4.4 P0 CLEAN"

if /I "%~1"=="content" goto force_content

rem Fast path: reuse an already running dev server.
where curl >nul 2>nul
if not errorlevel 1 (
  curl -s -o nul --max-time 1 %URL% >nul 2>nul
  if not errorlevel 1 goto open_app
)

where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
if not exist package.json goto invalid_project

if not exist node_modules\.bin\next.cmd (
  echo [SETUP] Installing Node dependencies...
  call npm ci
  if errorlevel 1 goto failed
)

rem Fast content path: only rebuild when source/build inputs changed.
echo [CONTENT] Checking runtime content...
call npm run content:ensure
if errorlevel 1 goto failed

echo [DEV] Starting Next.js on %URL% ...
start "%APP_NAME% - Server" cmd /k "title %APP_NAME% - Server && npm run dev"

echo [DEV] Waiting for server...
set /a TRIES=0
:wait_loop
where curl >nul 2>nul
if errorlevel 1 goto open_app
curl -s -o nul --max-time 1 %URL% >nul 2>nul
if not errorlevel 1 goto open_app
set /a TRIES+=1
if !TRIES! geq 30 goto open_app
timeout /t 1 /nobreak >nul
goto wait_loop

:force_content
where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
where python >nul 2>nul || goto missing_python
if not exist package.json goto invalid_project
echo [CONTENT] Forced rebuild...
call npm run content:rebuild
if errorlevel 1 goto failed
goto end_ok

:open_app
echo [OK] Dev server available at %URL%

set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "EDGE86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=1366,868
  goto end_ok
)
if exist "%EDGE86%" (
  start "" "%EDGE86%" --app=%URL% --window-size=1366,868
  goto end_ok
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "CHROMELOCAL=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --window-size=1366,868
  goto end_ok
)
if exist "%CHROME86%" (
  start "" "%CHROME86%" --app=%URL% --window-size=1366,868
  goto end_ok
)
if exist "%CHROMELOCAL%" (
  start "" "%CHROMELOCAL%" --app=%URL% --window-size=1366,868
  goto end_ok
)

start "" %URL%
goto end_ok

:missing_node
echo ERROR: Node.js/npm is missing.
goto failed
:missing_python
echo ERROR: Python is missing.
goto failed
:invalid_project
echo ERROR: package.json is missing. Wrong project folder.
goto failed
:failed
echo.
echo Development start failed.
pause
endlocal & exit /b 1
:end_ok
endlocal & exit /b 0
