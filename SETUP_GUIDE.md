# ShowAnswer — Complete Step-by-Step Setup Guide

This guide details how to set up, configure, and run the **ShowAnswer** project (Classroom Hub, Teacher Portal, and the Mobile Android Scanner App) on a fresh system.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Python 3.10+** (Ensure you check "Add Python to PATH" during installation).
2. **PostgreSQL 17** (Standard port `5432` with username `postgres`).
3. **Flutter SDK** (Required only if compiling/modifying the Android app).

---

## 🛠️ Step-by-Step Setup

### Step 1: Clone and Configure Environment Files
1. Clone this repository to your target machine.
2. In the root directory, copy the template `.env.example` file and rename it to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and verify the values. Update the `DATABASE_URL` with your local PostgreSQL credentials:
   ```ini
   DATABASE_URL=postgresql://[your_username]:[your_password]@localhost:5432/show_answer
   ```

---

### Step 2: Initialize the PostgreSQL Database
1. Open pgAdmin 4 or connect via psql:
   * **Host:** `localhost`
   * **Port:** `5432`
   * **User:** `postgres`
2. Create a new database named **`show_answer`**:
   ```sql
   CREATE DATABASE show_answer;
   ```
   *(Note: The tables will be auto-created by the Python app on startup).*

---

### Step 3: Install Python Dependencies
Open your terminal at the project root directory and run:
```bash
pip install -r QuestionScannerProject/requirements.txt
```
This installs the required packages, including `psycopg2-binary` (PostgreSQL adapter), OCR libraries, and utility dependencies.

---

### Step 4: Run the Portal Servers
* **Recommended:** Double-click or run **`start_postgres_and_servers.bat`** in your command terminal:
  ```powershell
  .\start_postgres_and_servers.bat
  ```
  *(This sets the environment variables, attempts to verify the Postgres service, and launches the unified server).*
  
#### Running the Server Manually:
If you prefer to start it manually:
```bash
cd QuestionScannerProject
python start_app.py
```
This runs the unified server on Port 8000.

---

## 🧭 Accessing the Portals

Open your browser and navigate to:
* **Admin Login (Classroom Hub / Roster / Card Generator):** `http://localhost:8000/admin/login.html`
* **Teacher Login (Quiz Setup / OCR Scanner / Grade Reports):** `http://localhost:8000/teacher/login.html`

Both portals run on **port 8000** and use the same database.

---

### Step 5: Setup & Build the Mobile Scanner App (Android APK)
To build and pack the static frontend assets into the Android WebView container app:

1. Connect your Android phone to your computer via USB (Ensure USB Debugging is enabled in Developer Options).
2. Run **`build_apk.bat`** from the project root folder:
  ```powershell
  .\build_apk.bat
  ```
  *(This syncs all index files, CSS styling, and JavaScript logic from your portal directories directly into the Flutter app assets, cleans the gradle build files, and compiles the final APK).*
3. Once completed successfully, the final release file will be copied to your root folder:
   ➔ **`QuizScanner_v4.apk`**
4. Transfer this APK file to your phone and install it.

---

## 🔒 Default Portal Logins (Offline / Standalone)
Use these credentials to log in during offline setup:
* **Admin Role (Classroom Hub):**
  * **Username:** `admin`
  * **Password:** `admin123`
  * **Mock Passcode (OTP):** `123456`
* **Teacher Role (Dashboard):**
  * **Username:** `teacher`
  * **Password:** `teacher123`
  * **Mock Passcode (OTP):** `123456`
