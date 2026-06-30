$ErrorActionPreference = 'Stop'

$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/show_answer'
Write-Host 'Setting DATABASE_URL to:' $env:DATABASE_URL
Write-Host ''
Write-Host 'Create the database first if needed:'
Write-Host '  createdb -h localhost -U postgres -p 5432 show_answer'
Write-Host ''
Write-Host 'Then start the servers with:'
Write-Host '  python CardGeneratorProject/start_app.py'
Write-Host '  python QuestionScannerProject/start_app.py'
