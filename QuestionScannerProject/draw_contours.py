import cv2
import numpy as np

img = cv2.imread("debug_scan.jpg")
if img is None:
    print("Error: debug_scan.jpg not found.")
    exit(1)

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
total_area = img.shape[0] * img.shape[1]

# Method 3 (MEAN_41_12) which detected the most candidates
thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 41, 12)
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

annotated = img.copy()

for idx, cnt in enumerate(contours):
    area = cv2.contourArea(cnt)
    x, y, w, h = cv2.boundingRect(cnt)
    aspect_ratio = float(w)/h
    hull = cv2.convexHull(cnt)
    hull_area = cv2.contourArea(hull)
    solidity = float(area)/hull_area if hull_area > 0 else 0
    
    if 0.0001 * total_area <= area <= 0.06 * total_area and 0.5 <= aspect_ratio <= 2.0 and solidity > 0.65:
        cx, cy = x + w//2, y + h//2
        cv2.drawContours(annotated, [cnt], -1, (0, 0, 255), 2)
        cv2.circle(annotated, (cx, cy), 5, (0, 255, 0), -1)
        cv2.putText(annotated, f"{cx},{cy}", (cx + 5, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 0), 1)

cv2.imwrite("debug_contours.jpg", annotated)
print("Annotated image saved to debug_contours.jpg")
