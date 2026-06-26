import cv2
import numpy as np

img = cv2.imread("debug_scan.jpg")
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

for idx, get_thresh in enumerate(threshold_methods):
    thresh = get_thresh(gray)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = float(w) / h
        
        # Check area and aspect ratio
        if 0.0001 * total_area <= area <= 0.06 * total_area:
            if 0.5 <= aspect_ratio <= 2.0:
                hull = cv2.convexHull(cnt)
                hull_area = cv2.contourArea(hull)
                solidity = float(area) / hull_area if hull_area > 0 else 0
                
                if solidity > 0.65:
                    cx, cy = x + w//2, y + h//2
                    
                    # Border exclusion: Must not be right at the border of the image
                    if (0.05 * W_img <= cx <= 0.95 * W_img) and (0.05 * H_img <= cy <= 0.95 * H_img):
                        candidates.append((cx, cy))
                        
    # Filter duplicates
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
        
        best_quad_for_method = None
        max_area_for_method = -1
        
        for p_tl in tls:
            for p_tr in trs:
                for p_br in brs:
                    for p_bl in bls:
                        # Edge lengths
                        top = np.sqrt((p_tr[0]-p_tl[0])**2 + (p_tr[1]-p_tl[1])**2)
                        bottom = np.sqrt((p_br[0]-p_bl[0])**2 + (p_br[1]-p_bl[1])**2)
                        left = np.sqrt((p_bl[0]-p_tl[0])**2 + (p_bl[1]-p_tl[1])**2)
                        right = np.sqrt((p_br[0]-p_tr[0])**2 + (p_br[1]-p_tr[1])**2)
                        
                        if top == 0 or bottom == 0 or left == 0 or right == 0:
                            continue
                            
                        ratio_tb = top / bottom
                        ratio_lr = left / right
                        
                        # Parallelism check
                        if (0.70 <= ratio_tb <= 1.43) and (0.70 <= ratio_lr <= 1.43):
                            # Distortion check: sum of horizontal and vertical offsets
                            distortion = abs(p_tl[0] - p_bl[0]) + abs(p_tr[0] - p_br[0]) + abs(p_tl[1] - p_tr[1]) + abs(p_bl[1] - p_br[1])
                            
                            # Limit distortion to 100 pixels (roughly 8% of width + height)
                            if distortion < 100:
                                # Sheet aspect ratio (width/height) must be portrait (between 0.5 and 0.98)
                                w_sheet = (p_tr[0] + p_br[0])/2 - (p_tl[0] + p_bl[0])/2
                                h_sheet = (p_bl[1] + p_br[1])/2 - (p_tl[1] + p_tr[1])/2
                                if h_sheet == 0:
                                    continue
                                sheet_aspect = w_sheet / h_sheet
                                
                                if 0.5 <= sheet_aspect <= 0.98:
                                    x1, y1 = p_tl
                                    x2, y2 = p_tr
                                    x3, y3 = p_br
                                    x4, y4 = p_bl
                                    area_val = 0.5 * abs(x1*y2 - y1*x2 + x2*y3 - y2*x3 + x3*y4 - y3*x4 + x4*y1 - y4*x1)
                                    
                                    if area_val > max_area_for_method:
                                        max_area_for_method = area_val
                                        best_quad_for_method = [p_tl, p_tr, p_br, p_bl]
                                    
        if best_quad_for_method is not None:
            print(f"Method {idx+1} found quad: {best_quad_for_method} with area {max_area_for_method:.1f}")
            if max_area_for_method > max_overall_area:
                max_overall_area = max_area_for_method
                best_overall_quad = best_quad_for_method

if best_overall_quad is not None:
    print(f"SELECTED BEST QUAD: {best_overall_quad} with area {max_overall_area:.1f}")
else:
    print("FAILED TO DETECT QUAD")
