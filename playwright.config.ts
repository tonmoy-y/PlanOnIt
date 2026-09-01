import { defineConfig } from '@playwright/test';

export const MOBILE_VIEWPORTS=[
  {name:'iphone-13-375x812',width:375,height:812},
  {name:'iphone-14-pro-390x844',width:390,height:844},
  {name:'pixel-7-412x915',width:412,height:915},
] as const;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
