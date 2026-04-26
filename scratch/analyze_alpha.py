from PIL import Image
import numpy as np

def analyze_alpha(path):
    img = Image.open(path).convert("RGBA")
    alpha = np.array(img.getchannel('A'))
    
    # Check dimensions
    h, w = alpha.shape
    print(f"Image Size: {w}x{h}")
    
    # Bounding box of alpha > 0
    coords = np.argwhere(alpha > 0)
    if coords.size == 0:
        print("Empty image")
        return
        
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0) + 1
    print(f"Alpha > 0 Bbox: ({x0}, {y0}, {x1}, {y1}) Size: {x1-x0}x{y1-y0}")
    
    # Bounding box of alpha > 200 (the "core" of the icon)
    coords_core = np.argwhere(alpha > 200)
    if coords_core.size > 0:
        cy0, cx0 = coords_core.min(axis=0)
        cy1, cx1 = coords_core.max(axis=0) + 1
        print(f"Alpha > 200 Bbox: ({cx0}, {cy0}, {cx1}, {cy1}) Size: {cx1-cx0}x{cy1-cy0}")
    
    # Percentage of image width taken by core
    if coords_core.size > 0:
        print(f"Core width %: {(cx1-cx0)/w * 100:.1f}%")

if __name__ == "__main__":
    analyze_alpha("src-tauri/icons/icon.png")
