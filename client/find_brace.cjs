const fs = require('fs');
const code = fs.readFileSync('src/pages/POS.jsx', 'utf8');

// Find unclosed brackets using a simple stack
const stack = [];
for (let i = 0; i < code.length; i++) {
  const char = code[i];
  if (char === '/' && code[i+1] === '/') {
    // skip to end of line
    while (i < code.length && code[i] !== '\n') i++;
    continue;
  }
  if (char === '/' && code[i+1] === '*') {
    // skip to end of block comment
    while (i < code.length && !(code[i] === '*' && code[i+1] === '/')) i++;
    i++;
    continue;
  }
  if (char === '"' || char === "'" || char === '`') {
    const quote = char;
    i++;
    while (i < code.length) {
      if (code[i] === '\\') { i += 2; continue; }
      if (code[i] === quote) break;
      i++;
    }
    continue;
  }
  
  if (char === '{' || char === '(' || char === '<') {
    let line = 1;
    for (let j = 0; j < i; j++) if (code[j] === '\n') line++;
    stack.push({ char, line });
  } else if (char === '}' || char === ')' || char === '>') {
    if (stack.length === 0) {
      console.log('Extra closing', char, 'at line', code.substring(0, i).split('\n').length);
    } else {
      const top = stack[stack.length - 1].char;
      if ((char === '}' && top === '{') || (char === ')' && top === '(') || (char === '>' && top === '<')) {
        stack.pop();
      } else {
        // Mismatch or just valid JSX like arrow function `=>` which has `>`
        if (char === '>' && code[i-1] === '=') {
          // It's an arrow function =>, ignore the >
        } else if (char === '>' && top !== '<') {
          // ignore, might be a greater-than sign
        } else {
          // Not necessarily an error, but let's see.
        }
      }
    }
  }
}
console.log('Remaining on stack (ignoring < which might be less-than):');
stack.filter(s => s.char !== '<').forEach(s => console.log(s.char, 'at line', s.line));
