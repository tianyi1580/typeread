
const fs = require('fs');

const content5k = JSON.parse(fs.readFileSync('/Users/tianyima/.gemini/antigravity/brain/1887a759-100c-4682-ae20-d72baaceb6d7/.system_generated/steps/130/content.md', 'utf8').split('---')[1].trim());

const allWords = content5k.words;

// Filter for 2-10 letters and alphabetical only
const filtered = allWords.filter(w => w.length >= 2 && w.length <= 10 && /^[a-z]+$/.test(w.toLowerCase()));

// Separate into buckets
const buckets = { 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
filtered.forEach(w => {
  const len = w.length;
  if (buckets[len]) buckets[len].push(w.toLowerCase());
});

// For Medium, we want a larger unique pool than Easy, and less aggressive weighting
// Unique Pool: Top 2000 filtered words
const uniquePool = filtered.slice(0, 2000).map(w => w.toLowerCase());

// Weighting: Top 500 words repeated 2 extra times (total 3 each)
const top500 = filtered.slice(0, 500).map(w => w.toLowerCase());

const finalBank = [];
finalBank.push(...top500);
finalBank.push(...top500);
finalBank.push(...uniquePool);

// Shuffle
for (let i = finalBank.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [finalBank[i], finalBank[j]] = [finalBank[j], finalBank[i]];
}

console.log(`Medium Unique Pool Size: ${uniquePool.length}`);
console.log(`Medium Final Weighted Bank Size: ${finalBank.length}`);

// Statistics
const stats = {};
finalBank.forEach(w => { stats[w.length] = (stats[w.length] || 0) + 1; });
console.log('Medium Final Length Distribution:');
for (let len = 2; len <= 10; len++) {
  if (stats[len]) {
    console.log(`${len} letters: ${stats[len]} (${(stats[len]/finalBank.length*100).toFixed(1)}%)`);
  }
}

fs.writeFileSync('scratch/new_medium_bank.json', JSON.stringify(finalBank));
