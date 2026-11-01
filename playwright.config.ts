import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const speechWav = fileURLToPath(new URL('./tests/fixtures/speech.wav', import.meta.url));

// Specs that also run in Firefox (npx playwright test --project=firefox), which can fake both
// a microphone and a shared screen. The rest rely on Chromium's fake audio file.
const FIREFOX = /(smoke|screen|screen-ocr|cross-browser)\.spec\.ts$/;
// Playwright's WebKit can't fake a shared screen and, its contexts being ephemeral, can't keep
// Blobs in IndexedDB, so it runs the specs that need neither.
const WEBKIT = /(smoke|cross-browser)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:4391', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4391',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${speechWav}`,
          ],
        },
      },
    },
    {
      name: 'firefox',
      testMatch: FIREFOX,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
          },
        },
      },
    },
    {
      name: 'webkit',
      testMatch: WEBKIT,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
