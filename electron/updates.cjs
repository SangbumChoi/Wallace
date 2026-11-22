const fs = require("node:fs/promises");
const path = require("node:path");

function installerVersion(name, platform, arch) {
  const pattern =
    platform === "darwin" && ["arm64", "x64"].includes(arch)
      ? new RegExp(`^Wallace-(\\d+\\.\\d+\\.\\d+)-${arch}\\.(?:pkg|dmg)$`)
      : platform === "win32" && arch === "x64"
        ? /^Wallace Setup (\d+\.\d+\.\d+)\.exe$/
        : null;
  return pattern?.exec(name)?.[1] ?? null;
}

function compareVersion(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

async function installers(directory, platform, arch, depth) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM", "ENOTDIR"].includes(error.code))
      return [];
    throw error;
  }

  const matches = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (
      entry.isDirectory() &&
      depth > 0 &&
      !entry.name.endsWith(".app") &&
      !entry.name.endsWith("-unpacked")
    ) {
      matches.push(...(await installers(candidate, platform, arch, depth - 1)));
    } else if (entry.isFile()) {
      const version = installerVersion(entry.name, platform, arch);
      if (version) matches.push({ version, path: candidate });
    }
  }
  return matches;
}

async function checkInstaller({ downloads, appPath, platform, arch, current }) {
  const folders = [{ directory: downloads, depth: 0 }];
  // Developer builds run from a release folder beside the other installers.
  let directory = appPath;
  while (directory !== path.dirname(directory)) {
    if (path.basename(directory) === "release") {
      folders.push({ directory, depth: 2 });
      break;
    }
    directory = path.dirname(directory);
  }

  const results = await Promise.all(
    folders.map(({ directory, depth }) =>
      installers(directory, platform, arch, depth),
    ),
  );
  return results
    .flat()
    .filter((item) => compareVersion(item.version, current) > 0)
    .sort((a, b) => compareVersion(b.version, a.version))[0];
}

module.exports = { checkInstaller, installerVersion, compareVersion };
