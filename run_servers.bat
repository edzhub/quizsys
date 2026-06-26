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
echo [1/2] Starting Classroom Hub (Port 8000)...
start "ShowAnswer - Classroom Hub (Port 8000)" cmd /k "cd CardGeneratorProject && python start_app.py"

echo [2/2] Starting Question Setup & Scanner (Port 8002)...
start "ShowAnswer - Question Scanner (Port 8002)" cmd /k "cd QuestionScannerProject && python start_app.py"

echo.
echo ======================================================
echo Both servers are launching!
echo - Admin Portal / Classroom Hub: http://localhost:8000
echo - Teacher Portal / Scanner:     http://localhost:8002
echo ======================================================
echo.
echo To stop the servers, simply close their respective command windows.
echo.
pause
