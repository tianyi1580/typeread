import os
import subprocess
from PIL import Image

def build_icns(source_png, output_icns):
    iconset_path = "icon.iconset"
    if not os.path.exists(iconset_path):
        os.makedirs(iconset_path)
    
    # Standard icon sizes
    sizes = [
        (16, "16x16"),
        (32, "16x16@2x"),
        (32, "32x32"),
        (64, "32x32@2x"),
        (128, "128x128"),
        (256, "128x128@2x"),
        (256, "256x256"),
        (512, "256x256@2x"),
        (512, "512x512"),
        (1024, "512x512@2x")
    ]
    
    img = Image.open(source_png)
    
    for size, name in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(iconset_path, f"icon_{name}.png"))
    
    # Run iconutil
    subprocess.run(["iconutil", "-c", "icns", iconset_path, "-o", output_icns])
    
    # Cleanup
    for f in os.listdir(iconset_path):
        os.remove(os.path.join(iconset_path, f))
    os.rmdir(iconset_path)
    print(f"Manually built {output_icns} from {source_png}")

if __name__ == "__main__":
    source = "src-tauri/icons/icon.png"
    output = "src-tauri/icons/icon.icns"
    build_icns(source, output)
