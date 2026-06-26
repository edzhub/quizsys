import cv2
import numpy as np
import os
import sys

RAPIDOCR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "RapidOCR", "python")
if RAPIDOCR_PATH not in sys.path:
    sys.path.append(RAPIDOCR_PATH)

from rapidocr import RapidOCR

reader = RapidOCR()

warped = cv2.imread("debug_warped.jpg")

# Apply +20mm shift to all crop vertical coordinates
SHIFT_MM = 20.0

def is_box_blank(img_box):
    if img_box is None or img_box.size == 0:
        return True
    gray = cv2.cvtColor(img_box, cv2.COLOR_BGR2GRAY)
    std_dev = np.std(gray)
    dark_pixels = np.sum(gray < 160)
    return std_dev < 10 or dark_pixels < 15

def clean_and_enhance_box(img_box):
    if img_box is None or img_box.size == 0:
        return img_box
    gray = cv2.cvtColor(img_box, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)

def crop_box_inside(left_mm, top_mm, width_mm=12, height_mm=12):
    t_shifted = top_mm + SHIFT_MM
    l = left_mm + 0.8
    t = t_shifted + 0.8
    w = width_mm - 1.6
    h = height_mm - 1.6
    
    x1 = int(l * 800 / 210)
    y1 = int(t * 1130 / 297)
    x2 = int((l + w) * 800 / 210)
    y2 = int((t + h) * 1130 / 297)
    
    cropped = warped[y1:y2, x1:x2]
    if cropped.size > 0:
        resized = cv2.resize(cropped, (50, 50))
        resized[0:5, :] = 255
        resized[-5:, :] = 255
        resized[:, 0:5] = 255
        resized[:, -5:] = 255
        return resized
    return cropped

def rapidocr_readtext(img, allowlist=None, use_det=False):
    # Pass use_det to reader
    res = reader(img, use_det=use_det)
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

def ocr_digits(boxes):
    processed = []
    for img_box in boxes:
        if is_box_blank(img_box):
            processed.append(np.ones((50, 50, 3), dtype=np.uint8) * 255)
        else:
            processed.append(clean_and_enhance_box(img_box))
            
    spacing = np.ones((50, 5, 3), dtype=np.uint8) * 255
    combined = processed[0]
    for img_box in processed[1:]:
        combined = np.hstack([combined, spacing, img_box])
        
    res = rapidocr_readtext(combined, allowlist='0123456789', use_det=False)
    text = "".join(res).replace(" ", "")
    
    if len(text) == len(boxes):
        return text
        
    result = []
    for idx, img_box in enumerate(processed):
        if is_box_blank(boxes[idx]):
            result.append("?")
        else:
            padded = cv2.copyMakeBorder(img_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
            res_ind = rapidocr_readtext(padded, allowlist='0123456789', use_det=False)
            char = "".join(res_ind).replace(" ", "")
            result.append(char[0] if char else "?")
    return "".join(result)

def ocr_answers(boxes):
    processed = []
    for img_box in boxes:
        if is_box_blank(img_box):
            processed.append(np.ones((50, 50, 3), dtype=np.uint8) * 255)
        else:
            processed.append(clean_and_enhance_box(img_box))
            
    spacing = np.ones((50, 5, 3), dtype=np.uint8) * 255
    combined = processed[0]
    for img_box in processed[1:]:
        combined = np.hstack([combined, spacing, img_box])
        
    res = rapidocr_readtext(combined, allowlist='abcdABCD', use_det=False)
    text = "".join(res).replace(" ", "").upper()
    
    if len(text) == len(boxes):
        return list(text)
        
    result = []
    for idx, img_box in enumerate(processed):
        if is_box_blank(boxes[idx]):
            result.append("?")
        else:
            padded = cv2.copyMakeBorder(img_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
            res_ind = rapidocr_readtext(padded, allowlist='abcdABCD', use_det=False)
            char = "".join(res_ind).replace(" ", "").upper()
            result.append(char[0] if char else "?")
    return result

roll_boxes = [crop_box_inside(20 + i*14, 40) for i in range(6)]
class_box = crop_box_inside(126.5, 40)
sec_box = crop_box_inside(156.5, 40)

num_questions = 5
start_y = 80.0
end_y = 262.0
available_height = end_y - start_y
step_y = min(32.0, available_height / num_questions)

ans_boxes = []
for i in range(num_questions):
    y = start_y + i * step_y
    ans_boxes.append(crop_box_inside(175, y))

roll_no = ocr_digits(roll_boxes)
class_text = "?"
if not is_box_blank(class_box):
    enhanced_class = clean_and_enhance_box(class_box)
    padded_class = cv2.copyMakeBorder(enhanced_class, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    class_res = rapidocr_readtext(padded_class, allowlist='0123456789', use_det=False)
    class_text = "".join(class_res).replace(" ", "")

sec_text = "?"
if not is_box_blank(sec_box):
    enhanced_sec = clean_and_enhance_box(sec_box)
    padded_sec = cv2.copyMakeBorder(enhanced_sec, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    sec_res = rapidocr_readtext(padded_sec, allowlist='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', use_det=False)
    sec_text = "".join(sec_res).replace(" ", "").upper()

answers = ocr_answers(ans_boxes)

print("--- No Detection OCR Results ---")
print("Roll No:", roll_no)
print("Class:", class_text)
print("Section:", sec_text)
print("Answers:", answers)
