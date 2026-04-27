
const fs = require('fs');
const content = fs.readFileSync('src/lib/word-bank.ts', 'utf8');

const easyMatch = content.match(/export const easy = \[(.*?)\];/);
const words = JSON.parse(`[${easyMatch[1]}]`);

const stats = {};
for (const w of words) {
  const len = w.length;
  stats[len] = (stats[len] || 0) + 1;
}

console.log('Final Word Length Distribution:');
for (let len = 1; len <= 10; len++) {
  if (stats[len]) {
    console.log(`${len} letters: ${stats[len]} words (${(stats[len]/words.length*100).toFixed(1)}%)`);
  }
}
