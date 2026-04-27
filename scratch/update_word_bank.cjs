
const fs = require('fs');
const newEasyBank = JSON.parse(fs.readFileSync('scratch/new_easy_bank.json', 'utf8'));
const wordBankPath = 'src/lib/word-bank.ts';
let content = fs.readFileSync(wordBankPath, 'utf8');

const newEasyString = `export const easy = ${JSON.stringify(newEasyBank)};`;

// Use regex to replace the entire export const easy line.
// It matches from "export const easy =" to the first ");" or similar.
// Actually, in the file it ends with "];" and then a newline.
content = content.replace(/export const easy = \[.*?\];/, newEasyString);

fs.writeFileSync(wordBankPath, content);
console.log('Updated easy word bank in src/lib/word-bank.ts');
