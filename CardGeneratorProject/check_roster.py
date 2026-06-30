import os, psycopg2
conn = psycopg2.connect(os.getenv('DATABASE_URL') or os.getenv('POSTGRES_URL') or 'postgresql://postgres:postgres@localhost:5432/show_answer')
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM students')
print('students_count', cur.fetchone()[0])
cur.execute('SELECT marker_id, student_id, name FROM students ORDER BY marker_id LIMIT 10')
for row in cur.fetchall():
    print(row)
conn.close()
