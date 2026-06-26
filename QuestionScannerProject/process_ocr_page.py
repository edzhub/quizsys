# process_ocr_page.py
import sys
import os
import re
import json
import base64
import argparse
import numpy as np
import cv2

# Reconfigure stdout/stderr to use UTF-8 to prevent Windows console character crashes
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
    except Exception:
        pass

RAPIDOCR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "RapidOCR", "python")
if RAPIDOCR_PATH not in sys.path:
    sys.path.append(RAPIDOCR_PATH)

try:
    from rapidocr import RapidOCR
    from rapidocr.ch_ppocr_rec.utils import CTCLabelDecode
except Exception as e:
    print(json.dumps({"status": "error", "message": f"Could not import RapidOCR: {e}"}))
    sys.exit(1)

# Monkeypatch CTCLabelDecode
def custom_ctc_call(self, preds, return_word_box=False, **kwargs):
    allowlist = getattr(self, 'allowlist', None)
    if allowlist is not None:
        allowed_set = set(allowlist)
        mask = np.zeros(preds.shape[2], dtype=bool)
        mask[0] = True
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
        preds_idx, preds_prob, return_word_box, wh_ratio_list, max_wh_ratio, remove_duplicate=True
    )
    return line_results, word_results

CTCLabelDecode.__call__ = custom_ctc_call

def rapidocr_readtext(img, allowlist=None, detail=0):
    if reader is None:
        return []
    h, w = img.shape[:2]
    use_det = (h > 200) or (w > 800)
    if reader.text_rec and reader.text_rec.postprocess_op:
        reader.text_rec.postprocess_op.allowlist = allowlist
    res = reader(img, use_det=use_det)
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
try:
    reader = RapidOCR()
    if reader is not None:
        reader.readtext = rapidocr_readtext
except Exception as e:
    reader = None

def align_and_ocr_file(image_path, page_num=1):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image from: {image_path}")
        
    H_img, W_img = img.shape[:2]
    total_area = W_img * H_img
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    threshold_methods = [
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 41, 12),
        lambda g: cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    ]
    
    best_overall_quad = None
    max_overall_area = -1
    
    for get_thresh in threshold_methods:
        try:
            thresh = get_thresh(gray)
            contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            candidates = []
            for cnt in contours:
                area = cv2.contourArea(cnt)
                x, y, w, h = cv2.boundingRect(cnt)
                aspect_ratio = float(w) / h
                if 0.0001 * total_area <= area <= 0.06 * total_area:
                    if 0.5 <= aspect_ratio <= 2.0:
                        hull = cv2.convexHull(cnt)
                        hull_area = cv2.contourArea(hull)
                        solidity = float(area) / hull_area if hull_area > 0 else 0
                        if solidity > 0.65:
                            M = cv2.moments(cnt)
                            if M["m00"] > 0:
                                cx = int(M["m10"] / M["m00"])
                                cy = int(M["m01"] / M["m00"])
                                if (0.01 * W_img <= cx <= 0.99 * W_img) and (0.01 * H_img <= cy <= 0.99 * H_img):
                                    candidates.append((cx, cy))
                                
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
                    
            if len(run_unique) >= 4:
                half_w = W_img / 2
                half_h = H_img / 2
                tls = [p for p in run_unique if p[0] < half_w and p[1] < half_h]
                trs = [p for p in run_unique if p[0] >= half_w and p[1] < half_h]
                brs = [p for p in run_unique if p[0] >= half_w and p[1] >= half_h]
                bls = [p for p in run_unique if p[0] < half_w and p[1] >= half_h]
                
                tls.sort(key=lambda p: p[0]**2 + p[1]**2)
                trs.sort(key=lambda p: (p[0] - W_img)**2 + p[1]**2)
                brs.sort(key=lambda p: (p[0] - W_img)**2 + (p[1] - H_img)**2)
                bls.sort(key=lambda p: p[0]**2 + (p[1] - H_img)**2)
                
                tls, trs, brs, bls = tls[:5], trs[:5], brs[:5], bls[:5]
                for p_tl in tls:
                    for p_tr in trs:
                        for p_br in brs:
                            for p_bl in bls:
                                top = np.sqrt((p_tr[0]-p_tl[0])**2 + (p_tr[1]-p_tl[1])**2)
                                bottom = np.sqrt((p_br[0]-p_bl[0])**2 + (p_br[1]-p_bl[1])**2)
                                left = np.sqrt((p_bl[0]-p_tl[0])**2 + (p_bl[1]-p_tl[1])**2)
                                right = np.sqrt((p_br[0]-p_tr[0])**2 + (p_br[1]-p_tr[1])**2)
                                if top == 0 or bottom == 0 or left == 0 or right == 0:
                                    continue
                                ratio_tb = top / bottom
                                ratio_lr = left / right
                                if (0.70 <= ratio_tb <= 1.43) and (0.70 <= ratio_lr <= 1.43):
                                    distortion = abs(p_tl[0] - p_bl[0]) + abs(p_tr[0] - p_br[0]) + abs(p_tl[1] - p_tr[1]) + abs(p_bl[1] - p_br[1])
                                    if distortion < 100:
                                        w_sheet = (p_tr[0] + p_br[0])/2 - (p_tl[0] + p_bl[0])/2
                                        h_sheet = (p_bl[1] + p_br[1])/2 - (p_tl[1] + p_tr[1])/2
                                        if h_sheet > 0:
                                            sheet_aspect = w_sheet / h_sheet
                                            if 0.5 <= sheet_aspect <= 0.98:
                                                x1, y1 = p_tl; x2, y2 = p_tr; x3, y3 = p_br; x4, y4 = p_bl
                                                area_val = 0.5 * abs(x1*y2 - y1*x2 + x2*y3 - y2*x3 + x3*y4 - y3*x4 + x4*y1 - y4*x1)
                                                if area_val > max_overall_area:
                                                    max_overall_area = area_val
                                                    best_overall_quad = [p_tl, p_tr, p_br, p_bl]
        except Exception:
            pass
            
    if best_overall_quad is None:
        raise ValueError("Failed to detect all 4 corner anchors. Please ensure lighting is bright and the sheet is properly aligned.")
        
    tl, tr, br, bl = best_overall_quad
    src_pts = np.float32([tl, tr, br, bl])
    dst_pts = np.float32([[67, 67], [733, 67], [733, 1065], [67, 1065]])
    M_warp = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(img, M_warp, (800, 1130))
    
    def is_box_blank(img_box):
        if img_box is None or img_box.size == 0:
            return True
        gray_box = cv2.cvtColor(img_box, cv2.COLOR_BGR2GRAY)
        std_dev = np.std(gray_box)
        if std_dev < 10:
            return True
        dark_pixels = np.sum(gray_box < 160)
        return dark_pixels < 15

    def preprocess_box(img_box):
        if is_box_blank(img_box):
            return np.ones((120, 120, 3), dtype=np.uint8) * 255
        return img_box

    expected_roll_x_mm = [20 + i*14 + 6 for i in range(6)]
    expected_class_x_mm = 126.5 + 6
    expected_sec_x_mm = 156.5 + 6
    expected_header_y_mm = 40 + 6
    
    start_y = 80.0
    expected_ans_x_mm = 175.0 + 6
    expected_ans_y_mm = [start_y + i * 36.4 + 6 for i in range(5)]

    best_ax, best_bx = 0.8150, 80.54
    best_ay, best_by = 1.0503, 72.20

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

    header_candidates = [b for b in unique_boxes if (b[1] + b[3]//2) < 250]
    best_header_row = []
    for b in header_candidates:
        cy = b[1] + b[3]//2
        row = [hc for hc in header_candidates if abs((hc[1] + hc[3]//2) - cy) <= 15]
        if len(row) > len(best_header_row):
            best_header_row = row
    best_header_row.sort(key=lambda b: b[0] + b[2]//2)

    ans_candidates = [b for b in unique_boxes if (b[0] + b[2]//2) > 500 and (b[1] + b[3]//2) > 200]
    best_ans_col = []
    for b in ans_candidates:
        cx = b[0] + b[2]//2
        col = [ac for ac in ans_candidates if abs((ac[0] + ac[2]//2) - cx) <= 20]
        if len(col) > len(best_ans_col):
            best_ans_col = col
    best_ans_col.sort(key=lambda b: b[1] + b[3]//2)

    expected_roll_x = [int(x_mm * 800.0 / 210.0) for x_mm in expected_roll_x_mm]
    expected_class_x = int(expected_class_x_mm * 800.0 / 210.0)
    expected_sec_x = int(expected_sec_x_mm * 800.0 / 210.0)
    expected_header_y = int(expected_header_y_mm * 1130.0 / 297.0)
    expected_ans_x = int(expected_ans_x_mm * 800.0 / 210.0)
    expected_ans_y = [int(y_mm * 1130.0 / 297.0) for y_mm in expected_ans_y_mm]

    if len(best_header_row) == 8:
        try:
            detected_x = [b[0] + b[2]//2 for b in best_header_row]
            slope, intercept = np.polyfit(expected_roll_x + [expected_class_x, expected_sec_x], detected_x, 1)
            best_ax, best_bx = slope, intercept
        except Exception:
            pass

    if len(best_ans_col) == 5 and len(best_header_row) >= 1:
        try:
            header_y_mean = np.mean([b[1] + b[3]//2 for b in best_header_row])
            detected_y = [header_y_mean] + [b[1] + b[3]//2 for b in best_ans_col]
            E_y = [expected_header_y] + expected_ans_y
            slope, intercept = np.polyfit(E_y, detected_y, 1)
            best_ay, best_by = slope, intercept
        except Exception:
            pass

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
            resized[0:2, :] = 255; resized[-2:, :] = 255; resized[:, 0:2] = 255; resized[:, -2:] = 255
            return resized
        return cropped

    img_q = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_q, "Q", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)
    img_a = np.ones((120, 120, 3), dtype=np.uint8) * 255
    cv2.putText(img_a, "A", (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 3.0, (0, 0, 0), 8)

    def ocr_single_char_prefixed(img_box, p1_img, p2_img, prefix_str, allow_chars):
        if is_box_blank(img_box): return "?"
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
        if chars: return chars[-1]
        return "?"

    ans_boxes = [crop_box_calibrated(expected_ans_x_mm, expected_ans_y_mm[i]) for i in range(5)]
    processed_ans = [preprocess_box(b) for b in ans_boxes]
    spacing_ans = np.ones((120, 4, 3), dtype=np.uint8) * 255
    combined_ans = processed_ans[0]
    for box in processed_ans[1:]:
        combined_ans = np.hstack([combined_ans, spacing_ans, box])
    combined_ans_padded = cv2.copyMakeBorder(combined_ans, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    res_ans = reader.readtext(combined_ans_padded, allowlist='abcdABCD', detail=0)
    answers_text = "".join(res_ans).replace(" ", "").upper()
    
    if len(answers_text) == 5:
        answers = list(answers_text)
    else:
        answers = []
        for idx in range(5):
            char = ocr_single_char_prefixed(ans_boxes[idx], img_q, img_a, "QA", "ABCD")
            answers.append(char)

    roll_no, class_text, sec_text = "?", "?", "?"
    if page_num == 1:
        roll_boxes = [crop_box_calibrated(expected_roll_x_mm[i], expected_header_y_mm) for i in range(6)]
        class_box = crop_box_calibrated(expected_class_x_mm, expected_header_y_mm)
        sec_box = crop_box_calibrated(expected_sec_x_mm, expected_header_y_mm)

        processed_roll = [preprocess_box(b) for b in roll_boxes]
        spacing_roll = np.ones((120, 4, 3), dtype=np.uint8) * 255
        combined_roll = processed_roll[0]
        for box in processed_roll[1:]:
            combined_roll = np.hstack([combined_roll, spacing_roll, box])
        combined_roll_padded = cv2.copyMakeBorder(combined_roll, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        res_roll = reader.readtext(combined_roll_padded, allowlist='0123456789', detail=0)
        roll_no = "".join(res_roll).replace(" ", "")
        
        if len(roll_no) != 6:
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

        if not is_box_blank(class_box):
            padded_class = cv2.copyMakeBorder(class_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
            res_class = reader.readtext(padded_class, allowlist='0123456789', detail=0)
            class_text = "".join(res_class).replace(" ", "")
        if not is_box_blank(sec_box):
            padded_sec = cv2.copyMakeBorder(sec_box, 20, 20, 40, 40, cv2.BORDER_CONSTANT, value=[255, 255, 255])
            res_sec = reader.readtext(padded_sec, allowlist='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', detail=0)
            sec_text = "".join(res_sec).replace(" ", "").upper()

    return {
        "roll_no": roll_no,
        "class": class_text,
        "section": sec_text,
        "answers": answers
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--page", type=int, default=1)
    args = parser.parse_args()

    try:
        res = align_and_ocr_file(args.image, args.page)
        print(json.dumps({"status": "success", "data": res}))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
