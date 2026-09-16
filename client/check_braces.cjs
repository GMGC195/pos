const fs = require('fs');
const content = fs.readFileSync('src/pages/POS.jsx', 'utf8');

// We use a simple parser that ignores braces inside strings and comments
let brace = 0;
let paren = 0;
let inString = false;
let stringChar = null;
let inComment = false;
let inBlockComment = false;

let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (!inString && !inComment && !inBlockComment) {
      if (char === '/' && nextChar === '/') {
        inComment = true;
        break;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        j++;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }
      if (char === '{') brace++;
      if (char === '}') {
        brace--;
        if (brace < 0) {
          console.log(`Negative brace at line ${i + 1}`);
        }
      }
      if (char === '(') paren++;
      if (char === ')') {
        paren--;
        if (paren < 0) {
          console.log(`Negative paren at line ${i + 1}`);
        }
      }
    } else if (inString) {
      if (char === '\\') {
        j++; // skip escaped char
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
    } else if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        j++;
      }
    }
  }
  inComment = false;
  if (brace !== 0 || paren !== 0) {
    // console.log(`Line ${i + 1}: brace=${brace}, paren=${paren}`);
  }
}

console.log('Final counts - brace:', brace, 'paren:', paren);
