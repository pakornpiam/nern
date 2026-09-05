const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5177', headless: true,
    launchOptions: { ...(process.env.TOPO_CHROMIUM ? { executablePath: process.env.TOPO_CHROMIUM } : {}), args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'python server.py', url: 'http://127.0.0.1:5177', reuseExistingServer: true, timeout: 20000 },
});
