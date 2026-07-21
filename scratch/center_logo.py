from PIL import Image
import os

logo_path = r"c:\Users\mddil\OneDrive\Pictures\OneDrive\Desktop\offline_lab_1\public\logo.png"

if not os.path.exists(logo_path):
    print("Logo path does not exist!")
    exit(1)

# Open image and convert to RGBA
img = Image.open(logo_path).convert('RGBA')
alpha = img.split()[-1]
bbox = alpha.getbbox()

if bbox:
    left, top, right, bottom = bbox
    print(f"Original bbox: {bbox}")
    
    # Crop the content
    cropped = img.crop((left, top, right, bottom))
    c_width, c_height = cropped.size
    
    # Create a new square image with transparent background
    target_size = max(c_width, c_height) + 40 # add some padding to the max dimension to keep it clean
    print(f"Creating new canvas of size {target_size}x{target_size}...")
    new_img = Image.new('RGBA', (target_size, target_size), (255, 255, 255, 0))
    
    # Calculate paste position to center the cropped image
    x_offset = (target_size - c_width) // 2
    y_offset = (target_size - c_height) // 2
    
    new_img.paste(cropped, (x_offset, y_offset), cropped)
    
    # Resize to standard 512x512
    final_img = new_img.resize((512, 512), Image.Resampling.LANCZOS)
    final_img.save(logo_path)
    print("Logo successfully centered and saved!")
else:
    print("Error: Could not calculate bounding box.")
