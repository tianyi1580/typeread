from PIL import Image
import os

def process_icon(input_path, output_path):
    """
    To remove the white platter on macOS for unsigned apps, 
    the PNG must be a SOLID 1024x1024 square with NO transparency.
    """
    img = Image.open(input_path).convert("RGBA")
    canvas_size = 1024
    
    # 1. Crop to the dark squircle content
    bbox = img.getbbox()
    img_content = img.crop(bbox)
    
    # 2. Get the background color (to fill the corners)
    # We sample near the edge of the cropped content
    bg_color = img_content.getpixel((5, 5))
    # Make it fully opaque
    solid_bg = (bg_color[0], bg_color[1], bg_color[2], 255)
    
    # 3. Scale the content to fill most of the 1024x1024 canvas
    # We leave a tiny bit of margin (~5%) so the logo doesn't hit the very edge
    visual_size = 960 
    w, h = img_content.size
    ratio = visual_size / max(w, h)
    new_w, new_h = int(w * ratio), int(h * ratio)
    img_scaled = img_content.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # 4. Create a SOLID canvas (NO TRANSPARENCY)
    final_img = Image.new("RGBA", (canvas_size, canvas_size), solid_bg)
    
    # 5. Paste the icon in the center
    offset = ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2)
    final_img.paste(img_scaled, offset, img_scaled)
    
    # 6. Force the alpha channel to be fully opaque for the entire image
    final_img = final_img.convert("RGB")
    
    # 7. Save
    final_img.save(output_path)
    print(f"Icon finalized as a SOLID square. Background: {solid_bg}")

if __name__ == "__main__":
    # Ensure paths are correct
    icon_path = "src-tauri/icons/iconOG.png"
    output_path = "src-tauri/icons/icon.png"
    
    if os.path.exists(icon_path):
        process_icon(icon_path, output_path)
    else:
        print(f"Error: Could not find source icon at {icon_path}")
