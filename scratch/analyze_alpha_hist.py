from PIL import Image
import numpy as np

def analyze_alpha_hist(path):
    img = Image.open(path).convert("RGBA")
    alpha = np.array(img.getchannel('A'))
    
    hist, bins = np.histogram(alpha, bins=10, range=(0, 255))
    print(f"Alpha Histogram: {hist}")
    
    # Check bbox at different thresholds
    for thresh in [1, 10, 50, 100, 200, 250]:
        coords = np.argwhere(alpha >= thresh)
        if coords.size > 0:
            y0, x0 = coords.min(axis=0)
            y1, x1 = coords.max(axis=0) + 1
            print(f"Thresh {thresh}: ({x0}, {y0}, {x1}, {y1}) Size: {x1-x0}x{y1-y0}")
        else:
            print(f"Thresh {thresh}: Empty")

if __name__ == "__main__":
    analyze_alpha_hist("src-tauri/icons/icon.png")
