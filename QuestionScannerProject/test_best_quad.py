import base64
import json
from start_app import align_and_ocr_sheet

try:
    with open("debug_scan.jpg", "rb") as f:
        img_bytes = f.read()
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    
    print("\n--- Running align_and_ocr_sheet on debug_scan.jpg ---")
    result = align_and_ocr_sheet(img_b64)
    print("\n--- OCR Scan Results ---")
    print(json.dumps(result, indent=2))
except Exception as e:
    import traceback
    traceback.print_exc()
