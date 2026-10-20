import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const speechWav = fileURLToPath(new URL('./tests/fixtures/speech.wav', import.meta.url));

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
  ],
});
