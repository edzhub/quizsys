@echo off
title ShowAnswer Server Manager
echo ======================================================
echo          Starting ShowAnswer Portal Servers
echo ======================================================
echo.

echo Verifying Python dependencies on your PC...
pip install -r QuestionScannerProject\requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: Failed to install python dependencies automatically. 
    echo Please make sure Python and pip are installed and added to your system PATH.
    echo.
    pause
)

echo.
echo Starting Unified Portal Server (Port 8000)...
start "ShowAnswer Unified Portal Server (Port 8000)" cmd /k "cd QuestionScannerProject && python start_app.py"

echo.
echo ======================================================
echo Server is launching!
echo - Unified Login Portal: http://localhost:8000/admin/login.html
echo ======================================================
echo.
echo To stop the server, simply close the command window.
echo.
pause
