
const fs = require('fs');

const content5k = JSON.parse(fs.readFileSync('/Users/tianyima/.gemini/antigravity/brain/1887a759-100c-4682-ae20-d72baaceb6d7/.system_generated/steps/130/content.md', 'utf8').split('---')[1].trim());

const allWords = content5k.words;

// Filter for 2-7 letters and alphabetical only
const filtered = allWords.filter(w => w.length >= 2 && w.length <= 7 && /^[a-z]+$/.test(w.toLowerCase()));

// Separate into buckets
const buckets = { 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
filtered.forEach(w => {
  const len = w.length;
  if (buckets[len]) buckets[len].push(w.toLowerCase());
});

// Target unique counts for 1500 words
const targetUnique = {
  2: 112,
  3: 300,
  4: 450,
  5: 450,
  6: 112,
  7: 75
};

const uniquePool = [];
for (let len = 2; len <= 7; len++) {
  uniquePool.push(...buckets[len].slice(0, targetUnique[len]));
}

// Weighting the top 200 most common words
const top200 = filtered.slice(0, 200).map(w => w.toLowerCase());

const finalBank = [];

// Add the top 200 words 4 extra times (total 5 each)
for (let i = 0; i < 4; i++) {
  finalBank.push(...top200);
}

// Add the unique pool once
finalBank.push(...uniquePool);

// Shuffle
for (let i = finalBank.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [finalBank[i], finalBank[j]] = [finalBank[j], finalBank[i]];
}

console.log(`Unique Pool Size: ${uniquePool.length}`);
console.log(`Final Weighted Bank Size: ${finalBank.length}`);

// Statistics
const stats = {};
finalBank.forEach(w => { stats[w.length] = (stats[w.length] || 0) + 1; });
console.log('Final Length Distribution:');
for (let len = 2; len <= 7; len++) {
  console.log(`${len} letters: ${stats[len] || 0} (${((stats[len] || 0)/finalBank.length*100).toFixed(1)}%)`);
}

fs.writeFileSync('scratch/new_easy_bank.json', JSON.stringify(finalBank));
