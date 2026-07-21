from PIL import Image
import os

logo_path = r"c:\Users\mddil\OneDrive\Pictures\OneDrive\Desktop\offline_lab_1\public\logo.png"

if not os.path.exists(logo_path):
    print("Logo path does not exist!")
    exit(1)

img = Image.open(logo_path)
print(f"Image mode: {img.mode}")
print(f"Image size: {img.size}")

# If image has alpha channel, get the bbox of non-zero alpha pixels
if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
    alpha = img.convert('RGBA').split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        print(f"Content Bounding Box (left, top, right, bottom): {bbox}")
        left, top, right, bottom = bbox
        width = right - left
        height = bottom - top
        print(f"Content dimensions: {width}x{height}")
        
        # Calculate padding
        img_width, img_height = img.size
        pad_left = left
        pad_right = img_width - right
        pad_top = top
        pad_bottom = img_height - bottom
        print(f"Paddings - Left: {pad_left}, Right: {pad_right}, Top: {pad_top}, Bottom: {pad_bottom}")
    else:
        print("Image is fully transparent!")
else:
    print("Image does not have transparency (alpha channel).")
