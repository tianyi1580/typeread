from PIL import Image
import os

def process_icon(input_path, output_path, target_visual_size=932):
    """
    Processes the icon to match macOS standard visual weight.
    Standard Big Sur icons use a 924x924 squircle in a 1024x1024 canvas.
    We use 932 by default to give it a bit more presence.
    """
    img = Image.open(input_path).convert("RGBA")
    
    # Get the bounding box of the actual icon content (alpha > 5)
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    
    if not bbox:
        print("Image is empty or fully transparent")
        return

    # Crop to the content
    img_cropped = img.crop(bbox)
    
    # Target canvas size
    canvas_size = 1024
    
    # We want the 'cropped' content (which we assume is the squircle) 
    # to occupy 'target_visual_size' within the 1024 canvas.
    w, h = img_cropped.size
    aspect = w / h
    
    if aspect > 1:
        new_w = target_visual_size
        new_h = int(new_w / aspect)
    else:
        new_h = target_visual_size
        new_w = int(new_h * aspect)
        
    img_scaled = img_cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Create the final 1024x1024 canvas
    new_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    
    # Paste centered
    offset = ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2)
    new_img.paste(img_scaled, offset)
    
    # Save the result
    new_img.save(output_path)
    print(f"Processed icon. Content size: {img_scaled.size}, Canvas: {new_img.size}")

if __name__ == "__main__":
    icon_path = "src-tauri/icons/iconOG.png"
    output_path = "src-tauri/icons/icon.png"
    # Target 880px
    # 924px (standard) was still appearing slightly too large compared to apps like Speedtest.
    # This 5% reduction (to ~86% canvas width) should hit the visual sweet spot.
    process_icon(icon_path, output_path, target_visual_size=880)
