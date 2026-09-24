@echo off
setlocal
cd /d "%~dp0"
title BranchMark Desktop Build
set "ELECTRON_BUILDER_CACHE=%~dp0desktop\.tmp\electron-builder-cache"

where node >nul 2>&1
if errorlevel 1 goto missing_node

where npm >nul 2>&1
if errorlevel 1 goto missing_npm

if not exist "desktop\node_modules\.bin\electron-builder.cmd" goto install_dependencies
if not exist "desktop\node_modules\electron\dist\electron.exe" goto install_dependencies
goto build

:install_dependencies
echo Electron packaging dependencies are missing. Installing them now...
call npm --prefix desktop install
if errorlevel 1 goto failed

:build
echo.
echo Building the Windows desktop installer and portable EXE...
call npm run desktop:build
if errorlevel 1 goto failed

echo.
echo Build completed. Output: desktop\release
if exist "desktop\release" start "" explorer.exe "%~dp0desktop\release"
goto done

:missing_node
echo ERROR: Node.js is not installed or is not available in PATH.
goto failed

:missing_npm
echo ERROR: npm is not available in PATH.
goto failed

:failed
echo.
echo Build failed. Review the error messages above.
pause
exit /b 1

:done
pause
endlocal
