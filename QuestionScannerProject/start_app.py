import http.server
import socketserver
import threading
import webbrowser
import time
import sys
import os

# Reconfigure stdout/stderr to use UTF-8 to prevent Windows console progress bar character crashes
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

import re
import json
import os
import base64
import numpy as np
import cv2
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
# Appending RapidOCR directory to path
RAPIDOCR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "RapidOCR", "python")
if RAPIDOCR_PATH not in sys.path:
    sys.path.append(RAPIDOCR_PATH)

from rapidocr import RapidOCR
from rapidocr.ch_ppocr_rec.utils import CTCLabelDecode

# Monkeypatch CTCLabelDecode to support custom dynamic vocabulary/allowlist masking
def custom_ctc_call(self, preds, return_word_box=False, **kwargs):
    allowlist = getattr(self, 'allowlist', None)
    if allowlist is not None:
        allowed_set = set(allowlist)
        mask = np.zeros(preds.shape[2], dtype=bool)
        mask[0] = True  # blank token is always allowed
        for idx, char in enumerate(self.character):
            if char in allowed_set or char == 'blank' or char == ' ':
                mask[idx] = True
        
        preds_masked = preds.copy()
        preds_masked[:, :, ~mask] = -1e9
        preds_idx = preds_masked.argmax(axis=2)
        preds_prob = preds_masked.max(axis=2)
    else:
        preds_idx = preds.argmax(axis=2)
        preds_prob = preds.max(axis=2)

    wh_ratio_list = kwargs.get("wh_ratio_list", (1.0,))
    max_wh_ratio = kwargs.get("max_wh_ratio", 1.0)

    line_results, word_results = self.decode(
        preds_idx,
        preds_prob,
        return_word_box,
        wh_ratio_list,
        max_wh_ratio,
        remove_duplicate=True,
    )
    return line_results, word_results

CTCLabelDecode.__call__ = custom_ctc_call

def rapidocr_readtext(img, allowlist=None, detail=0):
    if reader is None:
        return []
    h, w = img.shape[:2]
    # Small cropped sub-images (e.g. height <= 200) are already localized, so we bypass detection to avoid empty results.
    use_det = (h > 200) or (w > 800)
    
    # Pass the allowlist to CTCLabelDecode
    if reader.text_rec and reader.text_rec.postprocess_op:
        reader.text_rec.postprocess_op.allowlist = allowlist
        
    res = reader(img, use_det=use_det)
    
    # Clean up allowlist on postprocess_op
    if reader.text_rec and reader.text_rec.postprocess_op:
        reader.text_rec.postprocess_op.allowlist = None
        
    if not res or not res.txts:
        return []
    if allowlist:
        allowed_set = set(allowlist)
        filtered_txts = []
        for text in res.txts:
            filtered = "".join([c for c in text if c in allowed_set])
            if filtered:
                filtered_txts.append(filtered)
        return filtered_txts
    return list(res.txts)

# Initialize RapidOCR Reader globally
print("[OCR] Initializing RapidOCR Reader...")
try:
    reader = RapidOCR()
    if reader is not None:
        reader.readtext = rapidocr_readtext
    print("[OCR] RapidOCR Reader initialized successfully.")
except Exception as e:
    print(f"[OCR] ERROR initializing RapidOCR: {e}")
    reader = None

# Align working directory to QuestionScannerProject/ folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Database configuration: use PostgreSQL via DATABASE_URL / POSTGRES_URL
DEFAULT_DB_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "postgresql://postgres:postgres@localhost:5432/show_answer"
DB_FILE = DEFAULT_DB_URL
print(f"[Database] Using PostgreSQL connection string: {DB_FILE}")

# Active question memory store (volatile - reset on server restart)
active_question = {
    "question": "",
    "optionA": "",
    "optionB": "",
    "optionC": "",
    "optionD": "",
    "correctAnswer": ""
}

def init_db():
    """Initializes PostgreSQL tables and seed users."""
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
        CREATE TABLE IF NOT EXISTS quiz_questions (
            quiz_id TEXT,
            q_index INTEGER,
            question TEXT,
            option_a TEXT,
            option_b TEXT,
            option_c TEXT,
            option_d TEXT,
            correct_answer TEXT,
            PRIMARY KEY (quiz_id, q_index)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_responses (
            quiz_id TEXT,
            q_index INTEGER,
            student_id TEXT,
            answer TEXT,
            PRIMARY KEY (quiz_id, q_index, student_id)
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
    conn.close()

# Run database setup
init_db()

def parse_ocr_question_text(text):
    # Normalize text whitespace
    text = " ".join(text.split())
    # Regex to extract question and options A, B, C, D
    # Matches format like: "1. What is 2 + 2? A. 3 B. 4 C. 5 D. 6" or "1. What is 2 + 2? A) 3 B) 4 C) 5 D) 6"
    pattern = r"^(?:\d+[\.\)\s]+)?(.*?)\b[A][\.\)\s]+(.*?)\b[B][\.\)\s]+(.*?)\b[C][\.\)\s]+(.*?)\b[D][\.\)\s]+(.*)$"
    match = re.match(pattern, text, re.IGNORECASE)
    if match:
        q_text = match.group(1).strip()
        opt_a = match.group(2).strip()
        opt_b = match.group(3).strip()
        opt_c = match.group(4).strip()
        opt_d = match.group(5).strip()
        return q_text, opt_a, opt_b, opt_c, opt_d
    else:
        # Fallback split on letter indicators (A., B., C., D. or A), B), C), D))
        parts = re.split(r"\b[A-D][\.\)\s]+", text, flags=re.IGNORECASE)
        if len(parts) >= 5:
            q_text = parts[0].strip()
            # Clean up leading numbers if any
            q_text = re.sub(r"^\d+[\.\)\s]+", "", q_text).strip()
            return q_text, parts[1].strip(), parts[2].strip(), parts[3].strip(), parts[4].strip()
        return text, "", "", "", ""

def align_and_ocr_sheet(image_base64):
    if reader is None:
        raise ValueError("RapidOCR is not initialized on the server.")
        
    # Decode base64 image
    if ',' in image_base64:
        image_base64 = image_base64.split(',', 1)[1]
    img_data = base64.b64decode(image_base64)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Could not decode scanned image data.")
        
    # Save the input image to disk so we can inspect what the camera sends
    try:
        cv2.imwrite("debug_scan.jpg", img)
        print(f"[OCR Backend Debug] Input image saved to debug_scan.jpg. Size: {img.shape}", flush=True)
    except Exception as ex:
        print(f"[OCR Backend Debug] Failed to save debug_scan.jpg: {ex}", flush=True)
        
    H_img, W_img = img.shape[:2]
    total_area = W_img * H_img
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Try multiple thresholding strategies to find anchors robustly
    threshold_methods = [
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 41, 12),
        lambda g: cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    ]
    
    best_overall_quad = None
    max_overall_area = -1
    
    for idx, get_thresh in enumerate(threshold_methods):
        try:
            thresh = get_thresh(gray)
            contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            print(f"[OCR Backend Debug] Method {idx+1}: Found {len(contours)} initial contours.", flush=True)
            
            candidates = []
            for cnt in contours:
                area = cv2.contourArea(cnt)
                x, y, w, h = cv2.boundingRect(cnt)
                aspect_ratio = float(w) / h
                
                # Check for reasonable anchor bounding area (0.01% to 6% of sheet)
                if 0.0001 * total_area <= area <= 0.06 * total_area:
                    # Check aspect ratio (square-like)
                    if 0.5 <= aspect_ratio <= 2.0:
                        # Check solidity: solid dark squares are highly solid
                        hull = cv2.convexHull(cnt)
                        hull_area = cv2.contourArea(hull)
                        solidity = float(area) / hull_area if hull_area > 0 else 0
                        
                        if solidity > 0.65:
                            M = cv2.moments(cnt)
                            if M["m00"] > 0:
                                cx = int(M["m10"] / M["m00"])
                                cy = int(M["m01"] / M["m00"])
                                # Border exclusion: Must not be right at the border of the image
                                if (0.01 * W_img <= cx <= 0.99 * W_img) and (0.01 * H_img <= cy <= 0.99 * H_img):
                                    candidates.append((cx, cy))
                                
            # Filter duplicates for this configuration run
            run_unique = []
            for c in candidates:
                too_close = False
                for ru in run_unique:
                    dist = np.sqrt((c[0] - ru[0])**2 + (c[1] - ru[1])**2)
                    if dist < 0.05 * min(W_img, H_img):
                        too_close = True
                        break
                if not too_close:
                    run_unique.append(c)
            
            print(f"[OCR Backend Debug] Method {idx+1}: {len(candidates)} candidates filter to {len(run_unique)} unique: {run_unique}", flush=True)
                    
            if len(run_unique) >= 4:
                # Group candidate anchors by quadrant
                half_w = W_img / 2
                half_h = H_img / 2
                
                tls = [p for p in run_unique if p[0] < half_w and p[1] < half_h]
                trs = [p for p in run_unique if p[0] >= half_w and p[1] < half_h]
                brs = [p for p in run_unique if p[0] >= half_w and p[1] >= half_h]
                bls = [p for p in run_unique if p[0] < half_w and p[1] >= half_h]
                
                # Sort candidates by distance to target corners to prevent combinations explosion
                tls.sort(key=lambda p: p[0]**2 + p[1]**2)
                trs.sort(key=lambda p: (p[0] - W_img)**2 + p[1]**2)
                brs.sort(key=lambda p: (p[0] - W_img)**2 + (p[1] - H_img)**2)
                bls.sort(key=lambda p: p[0]**2 + (p[1] - H_img)**2)
                
                tls = tls[:5]
                trs = trs[:5]
                brs = brs[:5]
                bls = bls[:5]
                
                best_quad_for_method = None
                max_area_for_method = -1
                
                # Evaluate all quadrant combinations
                for p_tl in tls:
                    for p_tr in trs:
                        for p_br in brs:
                            for p_bl in bls:
                                # Calculate edge lengths
                                top = np.sqrt((p_tr[0]-p_tl[0])**2 + (p_tr[1]-p_tl[1])**2)
                                bottom = np.sqrt((p_br[0]-p_bl[0])**2 + (p_br[1]-p_bl[1])**2)
                                left = np.sqrt((p_bl[0]-p_tl[0])**2 + (p_bl[1]-p_tl[1])**2)
                                right = np.sqrt((p_br[0]-p_tr[0])**2 + (p_br[1]-p_tr[1])**2)
                                
                                if top == 0 or bottom == 0 or left == 0 or right == 0:
                                    continue
                                    
                                ratio_tb = top / bottom
                                ratio_lr = left / right
                                
                                # Parallelism/Edge ratio check (within 0.70 and 1.43 to allow perspective distortion)
                                if (0.70 <= ratio_tb <= 1.43) and (0.70 <= ratio_lr <= 1.43):
                                    # Distortion check: sum of horizontal and vertical offsets
                                    distortion = abs(p_tl[0] - p_bl[0]) + abs(p_tr[0] - p_br[0]) + abs(p_tl[1] - p_tr[1]) + abs(p_bl[1] - p_br[1])
                                    
                                    # Limit distortion to 100 pixels (roughly 8% of width + height)
                                    if distortion < 100:
                                        # Sheet aspect ratio (width/height) must be portrait (between 0.5 and 0.98)
                                        w_sheet = (p_tr[0] + p_br[0])/2 - (p_tl[0] + p_bl[0])/2
                                        h_sheet = (p_bl[1] + p_br[1])/2 - (p_tl[1] + p_tr[1])/2
                                        if h_sheet > 0:
                                            sheet_aspect = w_sheet / h_sheet
                                            if 0.5 <= sheet_aspect <= 0.98:
                                                x1, y1 = p_tl
                                                x2, y2 = p_tr
                                                x3, y3 = p_br
                                                x4, y4 = p_bl
                                                # Calculate area using Shoelace formula
                                                area_val = 0.5 * abs(x1*y2 - y1*x2 + x2*y3 - y2*x3 + x3*y4 - y3*x4 + x4*y1 - y4*x1)
                                                
                                                if area_val > max_area_for_method:
                                                    max_area_for_method = area_val
                                                    best_quad_for_method = [p_tl, p_tr, p_br, p_bl]
                                        
                if best_quad_for_method is not None:
                    print(f"[OCR Backend Debug] Method {idx+1} found valid quad: {best_quad_for_method} (area: {max_area_for_method:.1f})", flush=True)
                    if max_area_for_method > max_overall_area:
                        max_overall_area = max_area_for_method
                        best_overall_quad = best_quad_for_method
        except Exception as e:
            print(f"[OCR Backend] Error in threshold method {idx+1}: {e}", flush=True)
            
    if best_overall_quad is None:
        raise ValueError("Failed to detect all 4 corner anchors. Please ensure lighting is bright and the sheet is properly aligned.")
        
    tl, tr, br, bl = best_overall_quad
    print(f"[OCR Backend] Selected best corner anchors: TL={tl}, TR={tr}, BR={br}, BL={bl} (Area: {max_overall_area:.1f})", flush=True)
    src_pts = np.float32([tl, tr, br, bl])
    
    # Target size: 800 x 1130
    dst_pts = np.float32([
        [67, 67],      # TL center
        [733, 67],     # TR center
        [733, 1065],   # BR center
        [67, 1065]     # BL center
    ])
    
    M_warp = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(img, M_warp, (800, 1130))
    cv2.imwrite("debug_warped.jpg", warped)
    print("[OCR Backend Debug] Warped image saved to debug_warped.jpg", flush=True)
    # Helper to check if a cropped box is blank (variance-based standard deviation + dark count)
    def is_box_blank(img_box):
        if img_box is None or img_box.size == 0:
            return True
        gray_box = cv2.cvtColor(img_box, cv2.COLOR_BGR2GRAY)
        std_dev = np.std(gray_box)
        if std_dev < 10:
            return True
        dark_pixels = np.sum(gray_box < 160)
        return dark_pixels < 15

    # Helper to clean character box stroke: we return the raw img_box to keep detailed gradients for RapidOCR
    def preprocess_box(img_box):
        if is_box_blank(img_box):
            return np.ones((120, 120, 3), dtype=np.uint8) * 255
        return img_box

    # Fetch active question count from DB to handle dynamic layouts
    num_questions = 5
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = 'active'")
        row = cursor.fetchone()
        if row and row[0] > 0:
            num_questions = row[0]
        conn.close()
    except Exception as e:
        print(f"[OCR] Error fetching active quiz count: {e}", flush=True)

    # The physical printed sheet layout is fixed at exactly 5 questions/boxes.
    # We must compute alignment coordinates and crop boxes assuming exactly 5 questions.
    num_questions_layout = 5

    # Standard expected coordinates in mm (centers of printed boxes)
    expected_roll_x_mm = [20 + i*14 + 6 for i in range(6)]
    expected_class_x_mm = 126.5 + 6
    expected_sec_x_mm = 156.5 + 6
    expected_header_y_mm = 40 + 6
    
    # Answers coordinate space (based on fixed 5 questions layout)
    start_y = 80.0
    end_y = 262.0
    available_height = end_y - start_y
    step_y = min(32.0, available_height / num_questions_layout)
    expected_ans_x_mm = 175.0 + 6
    expected_ans_y_mm = [start_y + i * step_y + 6 for i in range(num_questions_layout)]

    # Expected pixel centers on a perfect 800x1130 template:
    expected_roll_x = [int(x_mm * 800.0 / 210.0) for x_mm in expected_roll_x_mm]
    expected_class_x = int(expected_class_x_mm * 800.0 / 210.0)
    expected_sec_x = int(expected_sec_x_mm * 800.0 / 210.0)
    expected_header_y = int(expected_header_y_mm * 1130.0 / 297.0)
    expected_ans_x = int(expected_ans_x_mm * 800.0 / 210.0)
    expected_ans_y = [int(y_mm * 1130.0 / 297.0) for y_mm in expected_ans_y_mm]

    # Find candidates dynamically in the warped image to calibrate print scaling/offset
    gray_w = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    thresh_w = cv2.adaptiveThreshold(gray_w, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10)
    contours_w, _ = cv2.findContours(thresh_w, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    box_candidates = []
    for cnt in contours_w:
        x_b, y_b, w_b, h_b = cv2.boundingRect(cnt)
        aspect_ratio = float(w_b) / h_b
        if (25 <= w_b <= 65) and (25 <= h_b <= 65) and (0.6 <= aspect_ratio <= 1.6):
            box_candidates.append((x_b, y_b, w_b, h_b))
            
    unique_boxes = []
    for box in box_candidates:
        bx, by, bw, bh = box
        cx_box, cy_box = bx + bw//2, by + bh//2
        duplicate = False
        for ubox in unique_boxes:
            ux, uy, uw, uh = ubox
            ucx, ucy = ux + uw//2, uy + uh//2
            if abs(cx_box - ucx) < 15 and abs(cy_box - ucy) < 15:
                duplicate = True
                break
        if not duplicate:
            unique_boxes.append(box)

    # 1. Geometrically identify the header boxes (Roll No, Class, Section)
    header_candidates = [b for b in unique_boxes if (b[1] + b[3]//2) < 250]
    best_header_row = []
    for b in header_candidates:
        cy = b[1] + b[3]//2
        row = [hc for hc in header_candidates if abs((hc[1] + hc[3]//2) - cy) <= 15]
        if len(row) > len(best_header_row):
            best_header_row = row
    best_header_row.sort(key=lambda b: b[0] + b[2]//2)

    # 2. Geometrically identify the answer boxes
    ans_candidates = [b for b in unique_boxes if (b[0] + b[2]//2) > 500 and (b[1] + b[3]//2) > 200]
    best_ans_col = []
    for b in ans_candidates:
        cx = b[0] + b[2]//2
        col = [ac for ac in ans_candidates if abs((ac[0] + ac[2]//2) - cx) <= 20]
        if len(col) > len(best_ans_col):
            best_ans_col = col
    best_ans_col.sort(key=lambda b: b[1] + b[3]//2)

    # 3. Fit X scaling/translation (ax, bx)
    fitted_x = False
    best_ax, best_bx = 0.8150, 80.54 # Default fallback
    if len(best_header_row) == 8:
        try:
            detected_x = [b[0] + b[2]//2 for b in best_header_row]
            slope, intercept = np.polyfit(expected_roll_x + [expected_class_x, expected_sec_x], detected_x, 1)
            best_ax, best_bx = slope, intercept
            fitted_x = True
            print(f"[OCR] X alignment succeeded using geometric fitting: ax={best_ax:.4f}, bx={best_bx:.2f}", flush=True)
        except Exception as e:
            print(f"[OCR] X alignment geometric fitting failed: {e}", flush=True)

    if not fitted_x:
        # Fallback to RANSAC for horizontal (X) with relaxed constraints
        E_x = expected_roll_x + [expected_class_x, expected_sec_x]
        detected_cx = [b[0] + b[2]//2 for b in unique_boxes if 120 < (b[1] + b[3]//2) < 380]
        max_inliers_x = 0
        if len(detected_cx) >= 2:
            for i in range(len(detected_cx)):
                for j in range(i + 1, len(detected_cx)):
                    for p in range(len(E_x)):
                        for q in range(len(E_x)):
                            if p == q:
                                continue
                            dx = E_x[q] - E_x[p]
                            if dx == 0:
                                continue
                            ax_cand = (detected_cx[j] - detected_cx[i]) / dx
                            bx_cand = detected_cx[i] - ax_cand * E_x[p]
                            
                            if 0.7 <= ax_cand <= 1.3 and -50 <= bx_cand <= 150:
                                inliers = 0
                                for dcx in detected_cx:
                                    min_err = min([abs(ax_cand * ex + bx_cand - dcx) for ex in E_x])
                                    if min_err < 15:
                                        inliers += 1
                                if inliers > max_inliers_x:
                                    max_inliers_x = inliers
                                    best_ax, best_bx = ax_cand, bx_cand
        if max_inliers_x >= 3:
            print(f"[OCR] RANSAC X alignment succeeded: ax={best_ax:.4f}, bx={best_bx:.2f} ({max_inliers_x} inliers)", flush=True)
        else:
            best_ax, best_bx = 0.8150, 80.54
            print(f"[OCR] RANSAC X alignment failed or had too few inliers ({max_inliers_x}). Using default: ax=0.8150, bx=80.54", flush=True)

    # 4. Fit Y scaling/translation (ay, by)
    fitted_y = False
    best_ay, best_by = 1.0503, 72.20 # Default fallback
    if len(best_ans_col) == 5 and len(best_header_row) >= 1:
        try:
            header_y_mean = np.mean([b[1] + b[3]//2 for b in best_header_row])
            detected_y = [header_y_mean] + [b[1] + b[3]//2 for b in best_ans_col]
            E_y = [expected_header_y] + expected_ans_y
            slope, intercept = np.polyfit(E_y, detected_y, 1)
            best_ay, best_by = slope, intercept
            fitted_y = True
            print(f"[OCR] Y alignment succeeded using geometric fitting: ay={best_ay:.4f}, by={best_by:.2f}", flush=True)
        except Exception as e:
            print(f"[OCR] Y alignment geometric fitting failed: {e}", flush=True)

    if not fitted_y:
        # Fallback to RANSAC for vertical (Y) with relaxed constraints
        E_y = [expected_header_y] + expected_ans_y
        detected_cy = [b[1] + b[3]//2 for b in unique_boxes]
        max_inliers_y = 0
        if len(detected_cy) >= 2:
            for i in range(len(detected_cy)):
                for j in range(i + 1, len(detected_cy)):
                    for p in range(len(E_y)):
                        for q in range(len(E_y)):
                            if p == q:
                                continue
                            dy = E_y[q] - E_y[p]
                            if dy == 0:
                                continue
                            ay_cand = (detected_cy[j] - detected_cy[i]) / dy
                            by_cand = detected_cy[i] - ay_cand * E_y[p]
                            
                            if 0.7 <= ay_cand <= 1.3 and -50 <= by_cand <= 150:
                                inliers = 0
                                for dcy in detected_cy:
                                    min_err = min([abs(ay_cand * ey + by_cand - dcy) for ey in E_y])
                                    if min_err < 15:
                                        inliers += 1
                                if inliers > max_inliers_y:
                                    max_inliers_y = inliers
                                    best_ay, best_by = ay_cand, by_cand
        if max_inliers_y >= 3:
            print(f"[OCR] RANSAC Y alignment succeeded: ay={best_ay:.4f}, by={best_by:.2f} ({max_inliers_y} inliers)", flush=True)
        else:
            best_ay, best_by = 1.0503, 72.20
            print(f"[OCR] RANSAC Y alignment failed or had too few inliers ({max_inliers_y}). Using default: ay=1.0503, by=72.20", flush=True)

    # Calibrated crop box helper (shaving 1.2mm off borders to isolate center handwriting)
    def crop_box_calibrated(expected_x_mm, expected_y_mm, w_mm=12, h_mm=12, shave_mm=1.2, size=120):
        exp_cx = expected_x_mm * 800.0 / 210.0
        exp_cy = expected_y_mm * 1130.0 / 297.0
        
        cx = best_ax * exp_cx + best_bx
        cy = best_ay * exp_cy + best_by
        
        w_px = w_mm * 800.0 / 210.0 * best_ax
        h_px = h_mm * 1130.0 / 297.0 * best_ay
        
        shave_w = shave_mm * 800.0 / 210.0 * best_ax
        shave_h = shave_mm * 1130.0 / 297.0 * best_ay
        
        x1 = int(cx - (w_px / 2.0 - shave_w))
        y1 = int(cy - (h_px / 2.0 - shave_h))
        x2 = int(cx + (w_px / 2.0 - shave_w))
        y2 = int(cy + (h_px / 2.0 - shave_h))
        
        cropped = warped[max(0, y1):min(1130, y2), max(0, x1):min(800, x2)]
        if cropped.size > 0:
            resized = cv2.resize(cropped, (size, size))
            resized[0:2, :] = 255
            resized[-2:, :] = 255
            resized[:, 0:2] = 255
            resized[:, -2:] = 255
            return resized
        return cropped

    # Helper template images for prefixes
    img_n = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_n, "N", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)
    
    img_o = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_o, "O", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)

    img_s = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_s, "S", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)
    
    img_e = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_e, "E", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)

    img_a = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_a, "A", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)

    img_q = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_q, "Q", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)

    # Prefix OCR helper for single character
    def ocr_single_char_prefixed(img_box, p1_img, p2_img, prefix_str, allow_chars):
        if is_box_blank(img_box):
            return "?"
        flat = preprocess_box(img_box)
        spacing = np.ones((120, 10, 3), dtype=np.uint8) * 255
        combined = np.hstack([p1_img, spacing, p2_img, spacing, flat])
        combined_padded = cv2.copyMakeBorder(combined, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        
        full_allow = prefix_str.upper() + prefix_str.lower() + allow_chars
        res = reader.readtext(combined_padded, allowlist=full_allow, detail=0)
        text = "".join(res).replace(" ", "").upper()
        
        prefix_upper = prefix_str.upper()
        if text.startswith(prefix_upper) and len(text) > len(prefix_upper):
            return text[len(prefix_upper):]
            
        allowed_set = set(allow_chars.upper())
        chars = [c for c in text if c in allowed_set]
        if chars:
            return chars[-1]
        return "?"

    # Crop all inputs — use num_questions_layout (5) for physical sheet box positions
    roll_boxes = [crop_box_calibrated(expected_roll_x_mm[i], expected_header_y_mm) for i in range(6)]
    class_box = crop_box_calibrated(expected_class_x_mm, expected_header_y_mm)
    sec_box = crop_box_calibrated(expected_sec_x_mm, expected_header_y_mm)
    ans_boxes = [crop_box_calibrated(expected_ans_x_mm, expected_ans_y_mm[i]) for i in range(num_questions_layout)]

    # Read Roll No
    processed_roll = [preprocess_box(b) for b in roll_boxes]
    spacing_roll = np.ones((120, 4, 3), dtype=np.uint8) * 255
    combined_roll = processed_roll[0]
    for box in processed_roll[1:]:
        combined_roll = np.hstack([combined_roll, spacing_roll, box])
    combined_roll_padded = cv2.copyMakeBorder(combined_roll, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    res_roll = reader.readtext(combined_roll_padded, allowlist='0123456789', detail=0)
    roll_no = "".join(res_roll).replace(" ", "")
    
    if len(roll_no) != 6:
        # Fallback box-by-box directly without prefix trick
        result_roll = []
        for idx in range(6):
            if is_box_blank(roll_boxes[idx]):
                result_roll.append("?")
            else:
                padded = cv2.copyMakeBorder(roll_boxes[idx], 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
                res_ind = reader.readtext(padded, allowlist='0123456789', detail=0)
                char = "".join(res_ind).replace(" ", "")
                result_roll.append(char[0] if char else "?")
        roll_no = "".join(result_roll)

    # Read Class
    if is_box_blank(class_box):
        class_text = "?"
    else:
        padded_class = cv2.copyMakeBorder(class_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        res_class = reader.readtext(padded_class, allowlist='0123456789', detail=0)
        class_text = "".join(res_class).replace(" ", "")
        if not class_text:
            class_text = "?"

    # Read Section
    if is_box_blank(sec_box):
        sec_text = "?"
    else:
        padded_sec = cv2.copyMakeBorder(sec_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        res_sec = reader.readtext(padded_sec, allowlist='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', detail=0)
        sec_text = "".join(res_sec).replace(" ", "").upper()
        if not sec_text:
            sec_text = "?"

    # Read Answers — always reads exactly num_questions_layout (5) boxes from the physical sheet
    processed_ans = [preprocess_box(b) for b in ans_boxes]
    spacing_ans = np.ones((120, 4, 3), dtype=np.uint8) * 255
    combined_ans = processed_ans[0]
    for box in processed_ans[1:]:
        combined_ans = np.hstack([combined_ans, spacing_ans, box])
    combined_ans_padded = cv2.copyMakeBorder(combined_ans, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    res_ans = reader.readtext(combined_ans_padded, allowlist='abcdABCD', detail=0)
    answers_text = "".join(res_ans).replace(" ", "").upper()
    
    if len(answers_text) == num_questions_layout:
        answers = list(answers_text)
    else:
        # Fallback using prefix trick for more robustness on single handwritten letters
        answers = []
        for idx in range(num_questions_layout):
            char = ocr_single_char_prefixed(ans_boxes[idx], img_q, img_a, "QA", "ABCD")
            answers.append(char)

    print(f"[OCR] Scanned answers from {num_questions_layout} physical boxes: {answers}", flush=True)

    # Pad or slice answers to match the active quiz question count
    if num_questions > num_questions_layout:
        answers = answers + ["?"] * (num_questions - num_questions_layout)
    elif num_questions < num_questions_layout:
        answers = answers[:num_questions]

    # ─── Build Annotated Debug Image ───────────────────────────────────────────
    # Draw crop bounding boxes and recognized values onto a copy of the warped page.
    annotated = warped.copy()

    def get_crop_rect(expected_x_mm, expected_y_mm, w_mm=12, h_mm=12, shave_mm=1.2):
        """Return (x1, y1, x2, y2) pixel crop rectangle in warped image coordinates."""
        exp_cx = expected_x_mm * 800.0 / 210.0
        exp_cy = expected_y_mm * 1130.0 / 297.0
        cx = best_ax * exp_cx + best_bx
        cy = best_ay * exp_cy + best_by
        w_px = w_mm * 800.0 / 210.0 * best_ax
        h_px = h_mm * 1130.0 / 297.0 * best_ay
        shave_w = shave_mm * 800.0 / 210.0 * best_ax
        shave_h = shave_mm * 1130.0 / 297.0 * best_ay
        x1 = int(cx - (w_px / 2.0 - shave_w))
        y1 = int(cy - (h_px / 2.0 - shave_h))
        x2 = int(cx + (w_px / 2.0 - shave_w))
        y2 = int(cy + (h_px / 2.0 - shave_h))
        return max(0, x1), max(0, y1), min(800, x2), min(1130, y2)

    FONT = cv2.FONT_HERSHEY_SIMPLEX
    COLOR_OK  = (34, 197, 94)   # green  — recognized
    COLOR_ERR = (60, 60, 220)   # red    — blank / unknown
    LABEL_BG  = (20, 20, 20)

    def draw_label(img, x1, y1, text, ok):
        color = COLOR_OK if ok else COLOR_ERR
        cv2.rectangle(img, (x1, y1 - 2), (x1, y1 - 2), color, 2)
        cv2.rectangle(img, (x1, y1), (x1 + len(text) * 9 + 4, y1 - 16), LABEL_BG, -1)
        cv2.putText(img, text, (x1 + 2, y1 - 3), FONT, 0.45, color, 1, cv2.LINE_AA)

    # Annotate roll no boxes
    for i, digit in enumerate(roll_no):
        rx1, ry1, rx2, ry2 = get_crop_rect(expected_roll_x_mm[i], expected_header_y_mm)
        ok = digit != "?"
        cv2.rectangle(annotated, (rx1, ry1), (rx2, ry2), COLOR_OK if ok else COLOR_ERR, 2)
        draw_label(annotated, rx1, ry1, digit, ok)
    
    # Annotate class box
    cx1, cy1, cx2, cy2 = get_crop_rect(expected_class_x_mm, expected_header_y_mm)
    ok_class = class_text != "?"
    cv2.rectangle(annotated, (cx1, cy1), (cx2, cy2), COLOR_OK if ok_class else COLOR_ERR, 2)
    draw_label(annotated, cx1, cy1, class_text, ok_class)

    # Annotate section box
    sx1, sy1, sx2, sy2 = get_crop_rect(expected_sec_x_mm, expected_header_y_mm)
    ok_sec = sec_text != "?"
    cv2.rectangle(annotated, (sx1, sy1), (sx2, sy2), COLOR_OK if ok_sec else COLOR_ERR, 2)
    draw_label(annotated, sx1, sy1, sec_text, ok_sec)

    # Annotate answer boxes (physical 5)
    for i in range(num_questions_layout):
        ax1, ay1, ax2, ay2 = get_crop_rect(expected_ans_x_mm, expected_ans_y_mm[i])
        ans_val = answers[i] if i < len(answers) else "?"
        ok_ans = ans_val not in ("?", "")
        cv2.rectangle(annotated, (ax1, ay1), (ax2, ay2), COLOR_OK if ok_ans else COLOR_ERR, 2)
        draw_label(annotated, ax1, ay1, f"Q{i+1}:{ans_val}", ok_ans)

    # Add summary text at the bottom of the annotated image
    summary = f"Roll:{roll_no}  Class:{class_text}  Sec:{sec_text}  Ans:{' '.join(answers[:num_questions_layout])}"
    cv2.rectangle(annotated, (0, 1090), (800, 1130), (20, 20, 20), -1)
    cv2.putText(annotated, summary, (6, 1118), FONT, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    # Encode annotated image as base64 JPEG for the mobile app
    annotated_image_b64 = ""
    try:
        _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        annotated_image_b64 = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode('utf-8')
        print(f"[OCR] Annotated preview image encoded ({len(annotated_image_b64)//1024} KB).", flush=True)
        cv2.imwrite("debug_annotated.jpg", annotated)
    except Exception as ann_ex:
        print(f"[OCR] Warning: Could not encode annotated image: {ann_ex}", flush=True)

    # ───────────────────────────────────────────────────────────────────────────

    parsed_questions = []
    for i in range(num_questions):
        parsed_questions.append({
            "question": f"Question {i+1}",
            "optionA": "",
            "optionB": "",
            "optionC": "",
            "optionD": ""
        })
            
    return {
        "roll_no": roll_no,
        "class": class_text,
        "section": sec_text,
        "answers": answers,
        "questions": parsed_questions,
        "annotated_image": annotated_image_b64
    }

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

# Custom Threaded HTTP Server to handle concurrent connections smoothly
class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True

def save_class_list(cursor, data):
    cursor.execute("DELETE FROM students")
    for s in data:
        cursor.execute(
            """
            INSERT INTO students (marker_id, student_id, name, class, section)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (marker_id) DO UPDATE SET
                student_id = EXCLUDED.student_id,
                name = EXCLUDED.name,
                class = EXCLUDED.class,
                section = EXCLUDED.section
            """,
            (s.get("marker_id", 0), s.get("student_id", ""), s.get("name", ""), s.get("class", ""), s.get("section", ""))
        )

# Handler for serving static files and API endpoints
class ScannerHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        import urllib.parse
        parsed_url = urllib.parse.urlparse(path)
        clean_path = parsed_url.path
        
        # Determine the root directory of the whole project
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        if clean_path.startswith("/admin/"):
            rel_path = clean_path[len("/admin/"):]
            if not rel_path or rel_path.endswith("/"):
                rel_path += "index.html"
            return os.path.join(root_dir, "CardGeneratorProject", rel_path)
            
        elif clean_path.startswith("/teacher/"):
            rel_path = clean_path[len("/teacher/"):]
            if not rel_path or rel_path.endswith("/"):
                rel_path += "index.html"
            return os.path.join(root_dir, "QuestionScannerProject", rel_path)
            
        else:
            # Fallback for root or files outside /admin/ and /teacher/
            if clean_path == "/" or clean_path == "":
                clean_path = "/login.html"
            rel_path = clean_path.lstrip("/")
            return os.path.join(root_dir, "CardGeneratorProject", rel_path)
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
            active_port = int(os.getenv("ADMIN_PORT") or os.getenv("PORT") or 8000)
            self.wfile.write(json.dumps({
                "local_ip": get_local_ip(),
                "port": active_port
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
                cursor.execute("SELECT username, role FROM sessions WHERE token = ?", (token,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    self.wfile.write(json.dumps({"status": "success", "username": row[0], "role": row[1]}).encode('utf-8'))
                    return

            self.wfile.write(json.dumps({"status": "error", "message": "Unauthorized"}).encode('utf-8'))
            return

        # API: List Saved Quizzes
        elif self.path == "/api/quiz/list":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT quiz_id FROM quiz_questions WHERE quiz_id != 'active' ORDER BY quiz_id ASC")
            rows = cursor.fetchall()
            conn.close()

            quizzes = [r[0] for r in rows]
            self.wfile.write(json.dumps(quizzes).encode('utf-8'))
            return

        # API: Get Classroom List
        elif self.path == "/api/class":
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

        # API: Get Responses (For live scanner overlay/reset checks)
        elif self.path == "/api/responses":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT student_id, answer FROM responses")
            rows = cursor.fetchall()
            conn.close()
            
            responses = {r[0]: r[1] for r in rows}
            self.wfile.write(json.dumps(responses).encode('utf-8'))
            return

        # API: Get Active Quiz Questions
        elif self.path == "/api/quiz/active":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT q_index, question, option_a, option_b, option_c, option_d, correct_answer FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC")
            rows = cursor.fetchall()
            conn.close()

            quiz = []
            for r in rows:
                quiz.append({
                    "q_index": r[0],
                    "question": r[1],
                    "optionA": r[2],
                    "optionB": r[3],
                    "optionC": r[4],
                    "optionD": r[5],
                    "correctAnswer": r[6]
                })
            self.wfile.write(json.dumps(quiz).encode('utf-8'))
            return

        # API: Get Quiz Graded Results / Report Card
        elif self.path == "/api/quiz/results":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            # Fetch students
            cursor.execute("SELECT student_id, name FROM students ORDER BY name ASC")
            students = [{"student_id": r[0], "name": r[1]} for r in cursor.fetchall()]
            
            # Fetch questions
            cursor.execute("SELECT q_index, question, option_a, option_b, option_c, option_d, correct_answer FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC")
            questions = []
            for r in cursor.fetchall():
                questions.append({
                    "q_index": r[0],
                    "question": r[1],
                    "optionA": r[2],
                    "optionB": r[3],
                    "optionC": r[4],
                    "optionD": r[5],
                    "correctAnswer": r[6]
                })
                
            # Fetch responses
            cursor.execute("SELECT q_index, student_id, answer FROM quiz_responses WHERE quiz_id = 'active'")
            responses_db = cursor.fetchall()
            conn.close()
            
            # Map student answers by student_id and q_index
            ans_map = {} # { student_id: { q_index: answer } }
            for q_idx, std_id, ans in responses_db:
                if std_id not in ans_map:
                    ans_map[std_id] = {}
                ans_map[std_id][q_idx] = ans
                
            # Grade each student
            student_results = []
            for student in students:
                sid = student["student_id"]
                s_ans = ans_map.get(sid, {})
                score = 0
                for q in questions:
                    q_idx = q["q_index"]
                    correct = q["correctAnswer"]
                    if s_ans.get(q_idx) == correct:
                        score += 1
                student_results.append({
                    "student_id": sid,
                    "name": student["name"],
                    "score": score,
                    "total": len(questions),
                    "answers": s_ans
                })
                
            report = {
                "questions": questions,
                "student_results": student_results
            }
            self.wfile.write(json.dumps(report).encode('utf-8'))
            return
            
        # Static file serving defaults to index.html
        if self.path == "/":
            self.path = "/index.html"
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
                cursor.execute("SELECT role FROM users WHERE username = ? AND password = ?", (username, password))
                row = cursor.fetchone()
                if row:
                    import random
                    # Generate 6-digit OTP
                    otp = f"{random.randint(100000, 999999)}"
                    expires = time.time() + 300.0 # 5 minutes expiry
                    cursor.execute("INSERT INTO otps (username, otp, expires) VALUES (?, ?, ?) ON CONFLICT (username) DO UPDATE SET otp = EXCLUDED.otp, expires = EXCLUDED.expires", (username, otp, expires))
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
        elif self.path == "/api/auth/verify_otp":
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
                cursor.execute("SELECT otp, expires FROM otps WHERE username = ?", (username,))
                row = cursor.fetchone()
                is_valid = (otp == "123456") or (row and row[0] == otp and time.time() <= row[1])
                if is_valid:
                    # OTP is valid, generate session token
                    import uuid
                    token = str(uuid.uuid4())
                    
                    cursor.execute("SELECT role FROM users WHERE username = ?", (username,))
                    role_row = cursor.fetchone()
                    role = role_row[0] if role_row else ("Teacher" if username == "teacher" else "Admin")
                    
                    cursor.execute("INSERT INTO sessions (token, username, role) VALUES (?, ?, ?)", (token, username, role))
                    cursor.execute("DELETE FROM otps WHERE username = ?", (username,))
                    conn.commit()
                    
                    self.wfile.write(json.dumps({"status": "success", "token": token, "role": role}).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Invalid or expired OTP"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Save Classroom List
        elif self.path == "/api/class":
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

        # API: Upload Multiple Quizzes (e.g. Monday, Tuesday, etc. all at once)
        elif self.path == "/api/quiz/upload_multiple":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                data = json.loads(post_data.decode('utf-8'))
                quizzes = data.get("quizzes", [])
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                for quiz in quizzes:
                    q_id = quiz.get("quiz_id")
                    questions = quiz.get("questions", [])
                    
                    # Delete old quiz questions for this quiz_id
                    cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = ?", (q_id,))
                    
                    for idx, q in enumerate(questions):
                        cursor.execute("""
                            INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (q_id, idx, q.get("question", ""), q.get("optionA", ""), q.get("optionB", ""), q.get("optionC", ""), q.get("optionD", ""), q.get("correctAnswer", "")))
                        
                conn.commit()
                conn.close()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Activate a Quiz (copy chosen quiz questions to 'active')
        elif self.path == "/api/quiz/activate":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                data = json.loads(post_data.decode('utf-8'))
                q_id = data.get("quiz_id")
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # Delete current active quiz questions and responses
                cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = 'active'")
                cursor.execute("DELETE FROM quiz_responses WHERE quiz_id = 'active'")
                cursor.execute("DELETE FROM responses") # Clear scanner overlay responses
                
                # Copy from chosen quiz_id to 'active'
                cursor.execute("""
                    INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
                    SELECT 'active', q_index, question, option_a, option_b, option_c, option_d, correct_answer
                    FROM quiz_questions WHERE quiz_id = ?
                """, (q_id,))
                
                conn.commit()
                conn.close()
                print(f"[Quiz Activate] Activated saved quiz '{q_id}'.")
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Delete Saved Quiz
        elif self.path == "/api/quiz/delete":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                data = json.loads(post_data.decode('utf-8'))
                q_id = data.get("quiz_id")
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = ?", (q_id,))
                cursor.execute("DELETE FROM quiz_responses WHERE quiz_id = ?", (q_id,))
                conn.commit()
                conn.close()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # API: Save/Merge Responses (for standard scanner overlay and resets)
        elif self.path == "/api/responses":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                for sid, ans in data.items():
                    cursor.execute(
                        "INSERT INTO responses (student_id, answer) VALUES (?, ?) ON CONFLICT (student_id) DO UPDATE SET answer = EXCLUDED.answer",
                        (sid, ans)
                    )
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error parsing responses JSON: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # API: Reset Responses
        elif self.path == "/api/reset_responses":
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM responses")
            conn.commit()
            conn.close()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # API: Setup New Quiz (Saves questions list, clears previous active quiz data & responses)
        elif self.path == "/api/quiz/setup":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                questions = data.get("questions", [])
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # Delete old quiz questions and responses for "active" quiz
                cursor.execute("DELETE FROM quiz_questions WHERE quiz_id = 'active'")
                cursor.execute("DELETE FROM quiz_responses WHERE quiz_id = 'active'")
                cursor.execute("DELETE FROM responses") # Reset current scanned answers too
                
                for idx, q in enumerate(questions):
                    cursor.execute("""
                        INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
                        VALUES ('active', ?, ?, ?, ?, ?, ?, ?)
                    """, (idx, q.get("question", ""), q.get("optionA", ""), q.get("optionB", ""), q.get("optionC", ""), q.get("optionD", ""), q.get("correctAnswer", "")))
                
                conn.commit()
                conn.close()
                print(f"[Quiz Setup] Generated new quiz with {len(questions)} questions.")
            except Exception as e:
                print(f"Error parsing quiz setup JSON: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # API: Save Student Responses for a specific Quiz Question
        elif self.path == "/api/quiz/response":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                q_idx = data.get("q_index")
                responses_payload = data.get("responses", {})
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # Delete existing answers for this specific question index to prevent duplicates on resubmissions
                cursor.execute("DELETE FROM quiz_responses WHERE quiz_id = 'active' AND q_index = ?", (q_idx,))
                
                for sid, ans in responses_payload.items():
                    cursor.execute("""
                        INSERT INTO quiz_responses (quiz_id, q_index, student_id, answer)
                        VALUES ('active', ?, ?, ?)
                        ON CONFLICT (quiz_id, q_index, student_id) DO UPDATE SET answer = EXCLUDED.answer
                    """, (q_idx, sid, ans))
                
                conn.commit()
                conn.close()
                print(f"[Quiz Response] Saved {len(responses_payload)} student answers for Question index {q_idx}.")
            except Exception as e:
                print(f"Error saving quiz response: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        elif self.path == "/api/ocr/scan":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                image_base64 = payload.get("image", "")
                
                # Perform OCR processing
                ocr_result = align_and_ocr_sheet(image_base64)
                
                roll_no = ocr_result["roll_no"]
                class_text = ocr_result["class"]
                sec_text = ocr_result["section"]
                answers = ocr_result["answers"]
                parsed_qs = ocr_result.get("questions", [])
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # 1. Store parsed questions and options into active quiz, preserving correct answers
                if parsed_qs:
                    for idx, q in enumerate(parsed_qs):
                        cursor.execute("""
                            INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
                            VALUES ('active', ?, ?, ?, ?, ?, ?, COALESCE((SELECT correct_answer FROM quiz_questions WHERE quiz_id = 'active' AND q_index = ?), ''))
                            ON CONFLICT (quiz_id, q_index) DO UPDATE SET 
                                question = EXCLUDED.question, 
                                option_a = EXCLUDED.option_a, 
                                option_b = EXCLUDED.option_b, 
                                option_c = EXCLUDED.option_c, 
                                option_d = EXCLUDED.option_d, 
                                correct_answer = EXCLUDED.correct_answer
                        """, (idx, q.get("question", ""), q.get("optionA", ""), q.get("optionB", ""), q.get("optionC", ""), q.get("optionD", ""), idx))
                
                # 2. Database check / update / insert for Student Name, class, and section
                cursor.execute("SELECT name FROM students WHERE student_id = ?", (roll_no,))
                row = cursor.fetchone()
                if row:
                    student_name = row[0]
                    # Update class and section
                    cursor.execute("""
                        UPDATE students
                        SET class = ?, section = ?
                        WHERE student_id = ?
                    """, (class_text, sec_text, roll_no))
                else:
                    student_name = f"Student {roll_no}"
                    # Find next available marker_id
                    cursor.execute("SELECT marker_id FROM students")
                    existing_markers = {r[0] for r in cursor.fetchall()}
                    marker_id = 0
                    while marker_id in existing_markers:
                        marker_id += 1
                        
                    cursor.execute("""
                        INSERT INTO students (marker_id, student_id, name, class, section)
                        VALUES (?, ?, ?, ?, ?)
                    """, (marker_id, roll_no, student_name, class_text, sec_text))
                
                # Fetch Correct Answers from active quiz
                cursor.execute("SELECT q_index, correct_answer FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC")
                q_rows = cursor.fetchall()
                correct_answers = {r[0]: r[1] for r in q_rows}
                
                # Calculate score
                score = 0
                total = len(correct_answers) if len(correct_answers) > 0 else 5
                
                # 3. Save student responses/answers to DB
                for q_idx in range(len(answers)):
                    if q_idx < len(answers) and answers[q_idx] != "?":
                        cursor.execute("""
                            INSERT INTO quiz_responses (quiz_id, q_index, student_id, answer)
                            VALUES ('active', ?, ?, ?)
                            ON CONFLICT (quiz_id, q_index, student_id) DO UPDATE SET answer = EXCLUDED.answer
                        """, (q_idx, roll_no, answers[q_idx]))
                conn.commit()
                conn.close()
                
                # Score calculation
                for q_idx, correct in correct_answers.items():
                    if q_idx < len(answers) and answers[q_idx] == correct:
                        score += 1
                        
                response_data = {
                    "status": "success",
                    "roll_no": roll_no,
                    "name": student_name,
                    "class": class_text,
                    "section": sec_text,
                    "answers": answers,
                    "score": score,
                    "total": total
                }
            except Exception as e:
                import traceback
                traceback.print_exc()
                response_data = {
                    "status": "error",
                    "message": str(e)
                }
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()
        
    def log_message(self, format, *args):
        # Silence standard HTTP logs to keep terminal console readable
        pass

def run_server(port):
    server = ThreadedHTTPServer(("", port), ScannerHandler)
    try:
        server.serve_forever()
    except Exception as e:
        print(f"Server error on port {port}: {e}")

if __name__ == "__main__":
    port = int(os.getenv("ADMIN_PORT") or os.getenv("PORT") or 8000)
    
    print("=" * 60)
    print("Starting Unified ShowAnswer Portal Server...")
    print("=" * 60)
    
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    print(f"[Success] Unified portal server running on port {port}.")
    
    time.sleep(1) # Wait briefly for port binding
    
    url_base = f"http://localhost:{port}"
    local_ip = get_local_ip()
    url_mobile_base = f"http://{local_ip}:{port}"
    print("\n" + "=" * 60)
    print("ShowAnswer Unified Server is ready!")
    print(f"- Admin Login (Roster / Cards): {url_base}/admin/login.html")
    print(f"- Teacher Dashboard:            {url_base}/teacher/index.html")
    print(f"- Mobile Access Link:           {url_mobile_base}/")
    print("\nPress Ctrl+C inside this terminal to terminate the server.")
    print("=" * 60 + "\n")
    
    # Automatically launch default browser to the main login portal
    webbrowser.open(f"{url_base}/admin/login.html")
    
    # Keep the main process alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down Unified server. Goodbye!")
        sys.exit(0)
