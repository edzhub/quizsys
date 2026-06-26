import cv2
import numpy as np

img = cv2.imread("debug_warped.jpg")
if img is None:
    print("Error: debug_warped.jpg not found.")
    exit(1)

# Convert to HSV
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Define blue color range for the blue boxes (hex #0284c7 or #2563eb)
# Blue Hue is typically 100-130
lower_blue = np.array([90, 30, 40])
upper_blue = np.array([135, 255, 255])

mask = cv2.inRange(hsv, lower_blue, upper_blue)
cv2.imwrite("debug_blue_mask.jpg", mask)

# Find contours
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
print(f"Found {len(contours)} total blue contours.")

annotated = img.copy()
box_candidates = []

for idx, cnt in enumerate(contours):
    area = cv2.contourArea(cnt)
    x, y, w, h = cv2.boundingRect(cnt)
    aspect_ratio = float(w) / h
    
    # We expect a blue box of 12mm x 12mm
    # On 800 wide A4 image, 12mm is about 45 pixels. So area should be around 45*45 = 2000 pixels?
    # Wait, the border itself is thin, so if it detects the outer border, area is around x,y,w,h bounding box
    # Let's check bounding box dimensions: w and h should be between 25 and 65 pixels
    if (20 <= w <= 65) and (20 <= h <= 65) and (0.6 <= aspect_ratio <= 1.6):
        cx, cy = x + w//2, y + h//2
        box_candidates.append((x, y, w, h, cx, cy))
        cv2.rectangle(annotated, (x, y), (x+w, y+h), (0, 255, 0), 2)
        cv2.putText(annotated, f"{cx},{cy}", (x, y-2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

cv2.imwrite("debug_detected_boxes.jpg", annotated)
print(f"Found {len(box_candidates)} blue box candidates after filtering.")
for idx, box in enumerate(box_candidates):
    print(f"Box {idx}: Center=({box[4]}, {box[5]}), Size=({box[2]}x{box[3]})")
