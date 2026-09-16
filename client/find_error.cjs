const fs = require('fs');
const code = fs.readFileSync('src/pages/POS.jsx', 'utf8');

const lines = code.split('\n');
let divDepth = 0;
let lastLine = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const openCount = (line.match(/<div/g) || []).length;
  const closeCount = (line.match(/<\/div>/g) || []).length;
  divDepth += (openCount - closeCount);
  if (openCount !== closeCount || divDepth !== 0) {
    // console.log(`Line ${i+1}: depth=${divDepth}`);
  }
  if (divDepth > 15) {
    console.log(`Deep div nesting at line ${i+1}: depth=${divDepth}`);
  }
}
console.log('Final div depth:', divDepth);
