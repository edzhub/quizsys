import cv2
import numpy as np

img = cv2.imread("debug_scan.jpg")
if img is None:
    print("Error: debug_scan.jpg not found.")
    exit(1)

H_img, W_img = img.shape[:2]
total_area = W_img * H_img
print(f"Image shape: {img.shape}, Total area: {total_area}")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

threshold_methods = [
    ("GAUSSIAN_51_15", lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)),
    ("GAUSSIAN_31_10", lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10)),
    ("MEAN_41_12", lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 41, 12)),
    ("OTSU", lambda g: cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1])
]

for name, get_thresh in threshold_methods:
    print(f"\n--- Method: {name} ---")
    thresh = get_thresh(gray)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for idx, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = float(w) / h
        
        # Calculate solidity
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = float(area) / hull_area if hull_area > 0 else 0
        
        # If it's a candidate or close to one, let's print it
        is_candidate_area = 0.0001 * total_area <= area <= 0.06 * total_area
        is_candidate_aspect = 0.5 <= aspect_ratio <= 2.0
        is_candidate_solidity = solidity > 0.65
        
        # Let's print if it's within area limits
        if is_candidate_area:
            print(f"Contour {idx}: Center=({x+w//2}, {y+h//2}), Area={area:.1f}, Aspect={aspect_ratio:.2f}, Solidity={solidity:.2f} | PASS: Area={is_candidate_area}, Aspect={is_candidate_aspect}, Solidity={is_candidate_solidity}")
