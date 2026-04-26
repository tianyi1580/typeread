from PIL import Image

def generate_test_icon(output_path):
    # 1024x1024 solid magenta square
    img = Image.new("RGBA", (1024, 1024), (255, 0, 255, 255))
    img.save(output_path)
    print(f"Generated test icon at {output_path}")

if __name__ == "__main__":
    generate_test_icon("src-tauri/icons/icon.png")
