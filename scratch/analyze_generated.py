from PIL import Image
import numpy as np

def analyze_generated_icon(path):
    img = Image.open(path).convert("RGBA")
    alpha = np.array(img.getchannel('A'))
    h, w = alpha.shape
    coords = np.argwhere(alpha > 0)
    if coords.size > 0:
        y0, x0 = coords.min(axis=0)
        y1, x1 = coords.max(axis=0) + 1
        print(f"File: {path} Size: {w}x{h}")
        print(f"Content Bbox: ({x0}, {y0}, {x1}, {y1}) Size: {x1-x0}x{y1-y0}")
        print(f"Content %: {(x1-x0)/w * 100:.1f}%")
    else:
        print(f"File: {path} is empty")

if __name__ == "__main__":
    analyze_generated_icon("src-tauri/icons/128x128@2x.png")
    analyze_generated_icon("src-tauri/icons/Square310x310Logo.png")
