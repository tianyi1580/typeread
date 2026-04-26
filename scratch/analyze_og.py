from PIL import Image
import numpy as np

def analyze_alpha(path):
    img = Image.open(path).convert("RGBA")
    alpha = np.array(img.getchannel('A'))
    h, w = alpha.shape
    coords = np.argwhere(alpha > 0)
    if coords.size > 0:
        y0, x0 = coords.min(axis=0)
        y1, x1 = coords.max(axis=0) + 1
        print(f"Path: {path} Size: {w}x{h}")
        print(f"Alpha > 0 Bbox: ({x0}, {y0}, {x1}, {y1}) Size: {x1-x0}x{y1-y0}")
    else:
        print(f"Path: {path} is empty")

if __name__ == "__main__":
    analyze_alpha("src-tauri/icons/iconOG.png")
