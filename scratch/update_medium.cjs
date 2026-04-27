
const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/lib/word-bank.ts');
const newMedium = JSON.parse(fs.readFileSync(path.join(__dirname, 'new_medium_bank.json'), 'utf8'));

let content = fs.readFileSync(targetFile, 'utf8');

// Replace the medium array
const startMarker = 'export const medium = [';
const endMarker = '];';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const before = content.substring(0, startIndex + startMarker.length);
  const after = content.substring(endIndex);
  const mid = newMedium.map(w => `"${w}"`).join(',');
  content = before + mid + after;
  fs.writeFileSync(targetFile, content);
  console.log('Updated medium word bank in src/lib/word-bank.ts');
} else {
  console.error('Could not find medium bank to replace');
}
