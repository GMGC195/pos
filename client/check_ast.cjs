const fs = require('fs');
const content = fs.readFileSync('src/pages/POS.jsx', 'utf8');

const babel = require('@babel/parser');
try {
  babel.parse(content, {
    sourceType: "module",
    plugins: ["jsx"]
  });
  console.log("No error!");
} catch(e) {
  console.log("Error at line", e.loc.line, "col", e.loc.column, ":", e.message);
}
