const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiDir = path.join(__dirname, '../app/api');

// Helper to recursively find all files in a directory
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeRename(src, dest, retries = 5, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`Rename attempt ${i + 1} failed for ${path.basename(src)}: ${err.message}. Retrying in ${delayMs}ms...`);
      await delay(delayMs);
    }
  }
  throw new Error(`Failed to rename ${src} to ${dest} after ${retries} attempts.`);
}

async function main() {
  const allFiles = getAllFiles(apiDir);
  const routeFiles = allFiles.filter(f => path.basename(f) === 'route.ts');
  const renamedFiles = [];

  console.log(`Found ${routeFiles.length} route files to temporarily disable.`);

  try {
    // 1. Temporarily rename all route.ts to route.ts.disabled
    for (const file of routeFiles) {
      const disabledPath = file + '.disabled';
      await safeRename(file, disabledPath);
      renamedFiles.push({ original: file, disabled: disabledPath });
    }

    // 2. Run next build
    console.log('Running Next.js build...');
    execSync('npx next build', { stdio: 'inherit' });
    console.log('Next.js build completed successfully.');

  } catch (err) {
    console.error('Build process failed:', err.message);
    process.exitCode = 1;
  } finally {
    // 3. Restore all disabled route files
    console.log('Restoring route files...');
    for (const pair of renamedFiles) {
      try {
        await safeRename(pair.disabled, pair.original);
      } catch (err) {
        console.error(`CRITICAL: Failed to restore route file: ${pair.original}. Error: ${err.message}`);
        process.exitCode = 1;
      }
    }
    console.log('Restore complete.');
  }
}

main();
