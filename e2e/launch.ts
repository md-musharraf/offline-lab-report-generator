import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

// Launches the desktop app on a throwaway profile + database. E2E_PACKAGED=1 runs the installed-layout
// build in dist/win-unpacked; otherwise Electron serves the static export in out/ from the repo.
export async function launchApp(name: string, env: Record<string, string> = {}, { fresh = true } = {}): Promise<{ app: ElectronApplication; page: Page; dataDir: string }> {
  const dataDir = path.join(root, '.e2e-data', name);
  if (fresh) fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir, 'downloads'), { recursive: true });
  const packaged = process.env.E2E_PACKAGED === '1';
  const app = await electron.launch({
    ...(packaged ? { executablePath: path.join(root, 'dist', 'win-unpacked', 'JharLab.exe') } : { args: [root] }),
    cwd: root,
    env: {
      ...process.env,
      JHARLAB_USER_DATA: dataDir,
      JHARLAB_STATIC: '1',
      JHARLAB_DOWNLOAD_DIR: path.join(dataDir, 'downloads'),
      NEXT_PUBLIC_ADMIN_DASHBOARD_URL: 'http://127.0.0.1:9', // unreachable unless a test supplies its own
      ...env,
    },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', err => console.error(`[${name}] page error:`, err.message));
  return { app, page, dataDir };
}

export async function startTrialIfLocked(page: Page) {
  const trial = page.getByRole('button', { name: /Start 7-Day Free Trial/i });
  await trial.or(page.getByText(/Laboratory Information|Set up your lab|Sign in/i).first()).first().waitFor();
  if (await trial.isVisible()) await trial.click();
}
