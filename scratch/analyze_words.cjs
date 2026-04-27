
const fs = require('fs');
const content = fs.readFileSync('src/lib/word-bank.ts', 'utf8');

const easyMatch = content.match(/export const easy = \[(.*?)\];/);
if (!easyMatch) {
  console.error('Could not find easy word bank');
  process.exit(1);
}

const words = JSON.parse(`[${easyMatch[1]}]`);

const filtered = words.filter(w => w.length <= 5);
const length45 = filtered.filter(w => w.length === 4 || w.length === 5);
const length23 = filtered.filter(w => w.length === 2 || w.length === 3);

console.log(`Total words: ${words.length}`);
console.log(`Filtered (<=5): ${filtered.length}`);
console.log(`4-5 letters: ${length45.length}`);
console.log(`2-3 letters: ${length23.length}`);

// To match monkeytype difficulty and user request:
// "majority 4-5 letters"
// "diverse with relatively common words"

// Let's take the top N words that are <= 5 letters.
// If we take the top 1000 common words that are <= 5 letters, it should be very diverse and common.

const topFiltered = filtered.slice(0, 1000);
const top45 = topFiltered.filter(w => w.length === 4 || w.length === 5);
console.log(`Top 1000 filtered 4-5 letters: ${top45.length} (${(top45.length/1000*100).toFixed(1)}%)`);

// If I want "majority 4-5 letters", I should ensure they are at least 60-70%.
// Currently, in the top 1000 filtered (length <= 5), how many are 4-5?
// Let's see the output of this script first.
