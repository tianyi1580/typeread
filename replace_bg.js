import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Skip files that shouldn't be touched (like color-picker where black/white might be explicit colors)
  if (filePath.includes('color-picker.tsx')) return;

  // Replace bg-black/x with bg-[var(--panel-soft)]
  content = content.replace(/bg-black\/\d+/g, 'bg-[var(--panel-soft)]');

  // Replace bg-white/x with bg-[var(--panel-soft)] unless it's hover
  content = content.replace(/(?<!hover:)bg-white\/\d+/g, 'bg-[var(--panel-soft)]');

  // Replace hover:bg-white/x with hover:bg-[var(--panel)]
  content = content.replace(/hover:bg-white\/\d+/g, 'hover:bg-[var(--panel)]');
  
  // Replace hover:bg-black/x with hover:bg-[var(--panel)]
  content = content.replace(/hover:bg-black\/\d+/g, 'hover:bg-[var(--panel)]');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Replaced overlays in ${path.basename(filePath)}`);
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

processDirectory(path.join(__dirname, 'src/components'));
replaceInFile(path.join(__dirname, 'src/App.tsx'));
