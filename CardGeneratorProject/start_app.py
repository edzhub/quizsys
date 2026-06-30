import http.server
import socketserver
import threading
import webbrowser
import time
import sys
import os

# Reconfigure stdout/stderr to use UTF-8 to prevent Windows console character crashes
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='ignore')
    except Exception:
        pass

import json
import os
import psycopg2

class _PostgresCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        sql = query.replace("?", "%s")
        return self._cursor.execute(sql, params) if params is not None else self._cursor.execute(sql)

    def executemany(self, query, params):
        sql = query.replace("?", "%s")
        return self._cursor.executemany(sql, params)

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def fetchmany(self, size=None):
        return self._cursor.fetchmany(size)

    def __getattr__(self, name):
        return getattr(self._cursor, name)

class _PostgresConnection:
    def __init__(self, connection):
        self._connection = connection

    def cursor(self):
        return _PostgresCursor(self._connection.cursor())

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()

class _CompatSqliteModule:
    OperationalError = psycopg2.OperationalError

    @staticmethod
    def connect(db_url):
        conn_str = db_url or os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "postgresql://postgres:postgres@localhost:5432/show_answer"
        connection = psycopg2.connect(conn_str)
        connection.autocommit = False
        return _PostgresConnection(connection)

sqlite3 = _CompatSqliteModule()

# Align working directory to CardGeneratorProject/ folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Database configuration
DB_FILE = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "postgresql://postgres:postgres@localhost:5432/show_answer"

def init_db():
    """Initializes PostgreSQL tables and migrates old roster.json data if exists."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            marker_id INTEGER PRIMARY KEY,
            student_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
    """)

    cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS class TEXT")
    cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS section TEXT")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS responses (
            student_id TEXT PRIMARY KEY,
            answer TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS otps (
            username TEXT PRIMARY KEY,
            otp TEXT NOT NULL,
            expires REAL NOT NULL
        )
    """)

    cursor.execute("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'Admin') ON CONFLICT (username) DO NOTHING")
    cursor.execute("INSERT INTO users (username, password, role) VALUES ('teacher', 'teacher123', 'Teacher') ON CONFLICT (username) DO NOTHING")

    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM students")
    count = cursor.fetchone()[0]
    if count == 0 and os.path.exists("roster.json"):
        try:
            with open("roster.json", "r", encoding="utf-8") as f:
                roster_data = json.load(f)
            for s in roster_data:
                cursor.execute(
                    "INSERT INTO students (marker_id, student_id, name, class, section) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (marker_id) DO NOTHING",
                    (s["marker_id"], s["student_id"], s["name"], s.get("class", ""), s.get("section", ""))
                )
            conn.commit()
            print(f"[OK] Auto-migrated {len(roster_data)} students from roster.json to PostgreSQL database.")
        except Exception as e:
            print(f"Failed to auto-migrate roster.json: {e}")

    conn.close()

# Run database setup
init_db()

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def save_class_list(cursor, data):
    cursor.execute("DELETE FROM students")
    for s in data:
        cursor.execute(
            """
            INSERT INTO students (marker_id, student_id, name, class, section)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (marker_id) DO UPDATE SET
                student_id = EXCLUDED.student_id,
                name = EXCLUDED.name,
                class = EXCLUDED.class,
                section = EXCLUDED.section
            """,
            (s.get("marker_id", 0), s.get("student_id", ""), s.get("name", ""), s.get("class", ""), s.get("section", ""))
        )

# Custom Threaded HTTP Server to handle concurrent connections smoothly
class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True

# Handler for serving static files and API endpoints
class ClassroomHubHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Send cache control headers to prevent caching of HTML/JS
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle CORS pre-flight checks
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        # API: Server Info
        if self.path == "/api/server-info":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "local_ip": get_local_ip(),
                "port": 8000
            }).encode('utf-8'))
            return

        # API: Check Session
        elif self.path.startswith("/api/auth/check"):
            token = None
            if "?" in self.path:
                parts = self.path.split("?")
                if len(parts) > 1:
                    params = parts[1].split("&")
                    for p in params:
                        if p.startswith("token="):
                            token = p.split("=")[1]
            if not token:
                auth_header = self.headers.get('Authorization')
                if auth_header and auth_header.startswith('Bearer '):
                    token = auth_header.split(' ')[1]

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            if token:
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT username, role FROM sessions WHERE token = %s", (token,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    self.wfile.write(json.dumps({"status": "success", "username": row[0], "role": row[1]}).encode('utf-8'))
                    return

            self.wfile.write(json.dumps({"status": "error", "message": "Unauthorized"}).encode('utf-8'))
            return

        # API: Get Classroom List
        if self.path == "/api/class":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT marker_id, student_id, name, class, section FROM students ORDER BY marker_id ASC")
            rows = cursor.fetchall()
            conn.close()
            
            class_list = [
                {
                    "marker_id": r[0],
                    "student_id": r[1],
                    "name": r[2],
                    "class": r[3] if len(r) > 3 and r[3] is not None else "",
                    "section": r[4] if len(r) > 4 and r[4] is not None else ""
                }
                for r in rows
            ]
            self.wfile.write(json.dumps(class_list).encode('utf-8'))
            return
            
        # Static file serving defaults to index.html
        if self.path == "/":
            self.path = "/index.html"
        print(f"[DEBUG] GET: {self.path} | CWD: {os.getcwd()} | Files in CWD: {os.listdir('.')}")
        return super().do_GET()

    def do_POST(self):
        # API: Auth Login
        if self.path == "/api/auth/login":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                data = json.loads(post_data.decode('utf-8'))
                username = data.get("username")
                password = data.get("password")

                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT role FROM users WHERE username = %s AND password = %s", (username, password))
                row = cursor.fetchone()
                if row:
                    import random
                    # Generate 6-digit OTP
                    otp = f"{random.randint(100000, 999999)}"
                    expires = time.time() + 300.0 # 5 minutes expiry
                    cursor.execute(
                        """
                        INSERT INTO otps (username, otp, expires)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (username) DO UPDATE SET otp = EXCLUDED.otp, expires = EXCLUDED.expires
                        """,
                        (username, otp, expires)
                    )
                    conn.commit()
                    
                    print("\n" + "=" * 50)
                    print(f"[MFA OTP] Generated OTP for user '{username}': {otp}")
                    print("=" * 50 + "\n")
                    
                    self.wfile.write(json.dumps({"status": "otp_required", "username": username, "otp_simulated": otp}).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Invalid username or password"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Verify OTP
        if self.path == "/api/auth/verify_otp":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                data = json.loads(post_data.decode('utf-8'))
                username = data.get("username")
                otp = data.get("otp")

                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT otp, expires FROM otps WHERE username = %s", (username,))
                row = cursor.fetchone()
                if row and row[0] == otp and time.time() <= row[1]:
                    # OTP is valid, generate session token
                    import uuid
                    token = str(uuid.uuid4())
                    
                    cursor.execute("SELECT role FROM users WHERE username = %s", (username,))
                    role = cursor.fetchone()[0]
                    
                    cursor.execute("INSERT INTO sessions (token, username, role) VALUES (%s, %s, %s)", (token, username, role))
                    cursor.execute("DELETE FROM otps WHERE username = %s", (username,))
                    conn.commit()
                    
                    self.wfile.write(json.dumps({"status": "success", "token": token, "role": role}).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Invalid or expired OTP"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Save Classroom List
        if self.path == "/api/class":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                save_class_list(cursor, data)
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error parsing class list JSON: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()
        
    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))

def run_server(port):
    server = ThreadedHTTPServer(("", port), ClassroomHubHandler)
    try:
        server.serve_forever()
    except Exception as e:
        print(f"Server error on port {port}: {e}")

if __name__ == "__main__":
    port = 8000
    
    print("=" * 60)
    print("Starting ShowAnswer Card Generator & Classroom Hub...")
    print("=" * 60)
    
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    print(f"[Success] Port {port} serving Classroom Hub is running.")
    
    time.sleep(1) # Wait briefly for port binding
    
    url_portal = f"http://localhost:{port}"
    local_ip = get_local_ip()
    url_mobile = f"http://{local_ip}:{port}"
    print("\n" + "=" * 60)
    print("ShowAnswer Card Generator is ready!")
    print(f"- Classroom Hub: {url_portal}")
    print(f"- Mobile Access: {url_mobile}")
    print("\nPress Ctrl+C inside this terminal to terminate the server.")
    print("=" * 60 + "\n")
    
    # Automatically launch default browser
    webbrowser.open(url_portal)
    
    # Keep the main process alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down Card Generator server. Goodbye!")
        sys.exit(0)
