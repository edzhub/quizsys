import base64
import json
import start_app
import sqlite3

# Set up 5-question active quiz
conn = sqlite3.connect(start_app.DB_FILE)
cursor = conn.cursor()
cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = 'active'")
for i in range(5):
    cursor.execute("""
        INSERT INTO quiz_questions
        (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
        VALUES (?, ?, ?, '', '', '', '', '')
    """, ('active', i, f'Q{i+1}'))
conn.commit()
conn.close()

with open('debug_scan.jpg', 'rb') as f:
    img_b64 = base64.b64encode(f.read()).decode()

result = start_app.align_and_ocr_sheet(img_b64)
print('Roll:', result['roll_no'])
print('Class:', result['class'])
print('Section:', result['section'])
print('Answers:', result['answers'])
print('annotated_image present:', bool(result.get('annotated_image', '')))
print('annotated_image size KB:', len(result.get('annotated_image', '')) // 1024)
