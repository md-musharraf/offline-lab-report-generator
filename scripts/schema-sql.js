// Writes prisma/schema.sql (full CREATE script for the current schema). The desktop app runs it
// through ensureSchema() on startup, so installs and updates get their tables without the Prisma CLI.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sql = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', {
  cwd: root,
  encoding: 'utf8',
});
fs.writeFileSync(path.join(root, 'prisma', 'schema.sql'), sql);
console.log(`prisma/schema.sql written (${sql.length} bytes)`);
