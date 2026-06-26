import base64
import json
import start_app
import sqlite3

def run_test():
    # Force the database active quiz to have 5 questions (or delete/mock it)
    try:
        conn = sqlite3.connect(start_app.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = 'active'")
        for i in range(5):
            cursor.execute("""
                INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
                VALUES ('active', ?, ?, '', '', '', '', '')
            """, (i, f"Question {i+1}"))
        conn.commit()
        conn.close()
        print("Mocked active quiz to 5 questions in database.")
    except Exception as e:
        print("Failed to mock database:", e)

    try:
        with open("debug_scan.jpg", "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode("utf-8")
        
        print("Starting align_and_ocr_sheet...")
        result = start_app.align_and_ocr_sheet(img_base64)
        print("Success! Result:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
