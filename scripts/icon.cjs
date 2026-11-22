const { chromium } = require("@playwright/test");
const fs = require("node:fs/promises");

async function renderIcons() {
  const source = await fs.readFile("build/logo.png", "base64");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    async function render(path, size, artworkSize, radius = "0") {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`
        <body style="margin:0;display:grid;place-items:center;height:100vh">
          <img src="data:image/png;base64,${source}" alt=""
               style="width:${artworkSize}px;height:${artworkSize}px;border-radius:${radius}">
        </body>
      `);
      await page.locator("img").evaluate((image) => image.decode());
      await page.screenshot({ path, omitBackground: true });
    }

    await render("build/icon.png", 1024, 824, "22%");
    await render("build/favicon.png", 64, 64, "20%");
    await render(
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      1024,
      1024,
    );

    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [density, scale] of Object.entries(densities)) {
      const directory = `android/app/src/main/res/mipmap-${density}`;
      await render(
        `${directory}/ic_launcher.png`,
        48 * scale,
        48 * scale,
        "20%",
      );
      await render(
        `${directory}/ic_launcher_round.png`,
        48 * scale,
        48 * scale,
        "50%",
      );
      await render(
        `${directory}/ic_launcher_foreground.png`,
        108 * scale,
        68 * scale,
        "50%",
      );
    }
  } finally {
    await browser.close();
  }
}

renderIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
