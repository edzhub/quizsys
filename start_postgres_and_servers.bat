@echo off
setlocal
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/show_answer

echo Starting PostgreSQL service...
net start postgresql-x64-17 2>nul
if errorlevel 1 (
  echo [Notice] Could not start postgresql-x64-17 service - it might already be running or named differently. Proceeding...
)

echo Starting servers...
start "ShowAnswer - Classroom Hub (Port 8000)" cmd /k "cd CardGeneratorProject && set DATABASE_URL=%DATABASE_URL% && python start_app.py"
start "ShowAnswer - Question Scanner (Port 8002)" cmd /k "cd QuestionScannerProject && set DATABASE_URL=%DATABASE_URL% && python start_app.py"

echo Servers started.
endlocal
