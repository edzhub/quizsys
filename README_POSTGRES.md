# PostgreSQL setup for quizSys

The backend has been updated to use PostgreSQL through the `DATABASE_URL` or `POSTGRES_URL` environment variable.

## 1. Install PostgreSQL
Use your preferred PostgreSQL installation method. A common local option is:
- PostgreSQL installed directly on Windows
- Docker with a PostgreSQL container

## 2. Create the database
Example:

```sql
CREATE DATABASE show_answer;
```

## 3. Set the connection string
PowerShell example:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/show_answer"
```

## 4. Start the servers

```powershell
python CardGeneratorProject/start_app.py
python QuestionScannerProject/start_app.py
```

The apps will create the required tables automatically on startup.
