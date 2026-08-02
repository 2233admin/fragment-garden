import { defineConfig, devices } from "@playwright/test";

const playwrightPort = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3100", 10);
const playwrightBaseUrl = `http://localhost:${playwrightPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // These suites assert the retired Phaser/NPC UI on /garden. They remain as Legacy
  // compatibility references, but are not valid acceptance tests for the new main entry.
  testIgnore: [
    "**/companion-ai.spec.ts",
    "**/companion-chat-recommendation.spec.ts",
    "**/fragment-lifecycle.spec.ts",
    "**/garden-backup.spec.ts",
    "**/garden-game-ui.spec.ts",
    "**/garden-movement-interaction.spec.ts",
    "**/garden-rendering-sync.spec.ts",
    "**/image-media.spec.ts",
    "**/link-fragment-import.spec.ts",
    "**/media-image.spec.ts",
    "**/sprout-analysis.spec.ts",
    "**/text-fragment-card-loop.spec.ts",
    "**/voice-media.spec.ts",
  ],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      process.platform === "win32"
        ? `node node_modules/next/dist/bin/next dev -p ${playwrightPort}`
        : `npm run dev -- -p ${playwrightPort}`,
    url: playwrightBaseUrl,
    env: { NEXT_DIST_DIR: ".next-playwright" },
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
  },
});
