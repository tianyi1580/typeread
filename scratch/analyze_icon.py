from PIL import Image
import os

def analyze_icon(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    print(f"Dimensions: {w}x{h}")
    
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    if bbox:
        print(f"Bounding box: {bbox}")
        bw = bbox[2] - bbox[0]
        bh = bbox[3] - bbox[1]
        print(f"Bounding box size: {bw}x{bh}")
    else:
        print("No bounding box found (fully transparent)")

if __name__ == "__main__":
    analyze_icon("src-tauri/icons/icon.png")
