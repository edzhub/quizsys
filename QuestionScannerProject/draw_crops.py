import cv2
import numpy as np

warped = cv2.imread("debug_warped.jpg")
if warped is None:
    print("Error: debug_warped.jpg not found.")
    exit(1)

annotated = warped.copy()

def get_coords(left_mm, top_mm, width_mm=12, height_mm=12):
    l = left_mm + 0.8
    t = top_mm + 0.8
    w = width_mm - 1.6
    h = height_mm - 1.6
    
    x1 = int(l * 800 / 210)
    y1 = int(t * 1130 / 297)
    x2 = int((l + w) * 800 / 210)
    y2 = int((t + h) * 1130 / 297)
    return (x1, y1, x2, y2)

# Roll No (6 digits)
for i in range(6):
    x1, y1, x2, y2 = get_coords(20 + i*14, 40)
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
    cv2.putText(annotated, f"R{i}", (x1, y1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

# Class
x1, y1, x2, y2 = get_coords(126.5, 40)
cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
cv2.putText(annotated, "C", (x1, y1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)

# Section
x1, y1, x2, y2 = get_coords(156.5, 40)
cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
cv2.putText(annotated, "S", (x1, y1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)

# Answers
num_questions = 5
start_y = 80.0
end_y = 262.0
available_height = end_y - start_y
step_y = min(32.0, available_height / num_questions)

for i in range(num_questions):
    y = start_y + i * step_y
    x1, y1, x2, y2 = get_coords(175, y)
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (255, 0, 0), 2)
    cv2.putText(annotated, f"A{i}", (x1, y1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 0), 1)

cv2.imwrite("debug_warped_rects.jpg", annotated)
print("Annotated image saved to debug_warped_rects.jpg")
