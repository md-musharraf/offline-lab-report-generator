// Dev-server (`next dev`) entry for every /api/* call. The packaged desktop app serves the same
// handlers from Electron's app:// protocol; see lib/server-api.js. Excluded from the static export.
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../../../prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../lib/server-api');

export const dynamic = 'force-dynamic';

// Kept on globalThis so hot reloads keep one database connection and the signed-in session.
const g = globalThis as unknown as { jharlab?: { ctx: any; ready: Promise<void> } };
if (!g.jharlab) {
  const prisma = new PrismaClient();
  // Same start-up schema check as the desktop app, so `npm run dev` keeps working after schema changes.
  const ready = api.ensureSchema(prisma, fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.sql'), 'utf8'));
  g.jharlab = { ctx: { prisma, dataDir: process.cwd(), session: null }, ready };
}
const { ctx, ready } = g.jharlab;

export async function GET(req: Request) {
  await ready;
  return api.handleRequest(ctx, req);
}
export const POST = GET;
