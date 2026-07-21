const fs = require('fs');
const path = require('path');

const dir = 'app';

function walkDir(currentPath) {
  const files = fs.readdirSync(currentPath);
  for (const file of files) {
    const fullPath = path.join(currentPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Match: const initialWhatever : Type[] = [ ... ];
  const arrayRegex = /(const initial[A-Za-z0-9_]+(?:[^=]+)?\s*=\s*)\[([\s\S]*?)\];/g;
  
  content = content.replace(arrayRegex, (match, p1, p2) => {
    if (p2.trim() === '') return match;
    changed = true;
    return p1 + '[];';
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated arrays in', filePath);
  }
}

walkDir(dir);
