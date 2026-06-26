import cv2
import numpy as np

warped = cv2.imread("debug_warped.jpg")
if warped is None:
    print("Error: debug_warped.jpg not found.")
    exit(1)

def is_box_blank(img_box):
    if img_box is None or img_box.size == 0:
        return True
    gray = cv2.cvtColor(img_box, cv2.COLOR_BGR2GRAY)
    std_dev = np.std(gray)
    dark_pixels = np.sum(gray < 160)
    return std_dev < 10 or dark_pixels < 15, std_dev, dark_pixels

def crop_box_inside(left_mm, top_mm, width_mm=12, height_mm=12):
    l = left_mm + 0.8
    t = top_mm + 0.8
    w = width_mm - 1.6
    h = height_mm - 1.6
    
    x1 = int(l * 800 / 210)
    y1 = int(t * 1130 / 297)
    x2 = int((l + w) * 800 / 210)
    y2 = int((t + h) * 1130 / 297)
    
    cropped = warped[y1:y2, x1:x2]
    if cropped.size > 0:
        resized = cv2.resize(cropped, (50, 50))
        # Whiten the outer 5px edges to completely erase blue border box lines
        resized[0:5, :] = 255
        resized[-5:, :] = 255
        resized[:, 0:5] = 255
        resized[:, -5:] = 255
        return resized, (x1, y1, x2, y2)
    return cropped, (0, 0, 0, 0)

print("--- Roll Numbers ---")
for i in range(6):
    box, coords = crop_box_inside(20 + i*14, 40)
    blank, std_dev, dark = is_box_blank(box)
    cv2.imwrite(f"roll_{i}.jpg", box)
    print(f"Roll {i} coords={coords}: Blank={blank}, StdDev={std_dev:.1f}, DarkPixels={dark}")

print("--- Class ---")
class_box, coords = crop_box_inside(126.5, 40)
blank, std_dev, dark = is_box_blank(class_box)
cv2.imwrite("class.jpg", class_box)
print(f"Class coords={coords}: Blank={blank}, StdDev={std_dev:.1f}, DarkPixels={dark}")

print("--- Section ---")
sec_box, coords = crop_box_inside(156.5, 40)
blank, std_dev, dark = is_box_blank(sec_box)
cv2.imwrite("section.jpg", sec_box)
print(f"Section coords={coords}: Blank={blank}, StdDev={std_dev:.1f}, DarkPixels={dark}")

print("--- Answers ---")
# Answers coords logic
num_questions = 5
start_y = 80.0
end_y = 262.0
available_height = end_y - start_y
step_y = min(32.0, available_height / num_questions)

for i in range(num_questions):
    y = start_y + i * step_y
    box, coords = crop_box_inside(175, y)
    blank, std_dev, dark = is_box_blank(box)
    cv2.imwrite(f"ans_{i}.jpg", box)
    print(f"Ans {i} coords={coords}: Blank={blank}, StdDev={std_dev:.1f}, DarkPixels={dark}")
