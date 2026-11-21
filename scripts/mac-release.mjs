import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

const [mode, ...options] = process.argv.slice(2);
const bundleId = "com.sangbumchoi.wallace";
const destination = "/Applications/Wallace.app";
const builder = path.resolve("node_modules/electron-builder/cli.js");

function run(file, args) {
  execFileSync(file, args, { stdio: "inherit" });
}

function appProcesses(terminate = false) {
  return execFileSync(
    "/usr/bin/osascript",
    [
      "-l",
      "JavaScript",
      "-e",
      `ObjC.import('AppKit');
     const apps = ObjC.unwrap($.NSRunningApplication.runningApplicationsWithBundleIdentifier('${bundleId}'));
     ${terminate ? "apps.forEach(app => app.terminate);" : ""}
     apps.map(app => String(app.processIdentifier)).join(' ');`,
    ],
    { encoding: "utf8" },
  ).trim();
}

function designatedRequirement(app) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "-r-", app], {
    encoding: "utf8",
  });
  return result.stderr?.match(/^designated => (.+)$/m)?.[1];
}

function verifyUpgradeIdentity(installed, replacement) {
  const requirement = designatedRequirement(installed);
  if (!requirement || /^(?:cdhash |\(cdhash )/.test(requirement)) return;
  const result = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "-R", requirement, replacement],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      "The update does not match the installed Wallace signing identity. Build with the same signing certificate.",
    );
}

function signingOptions() {
  const identity =
    process.env.WALLACE_MAC_SIGNING_IDENTITY?.trim() ||
    process.env.CSC_NAME?.trim();
  if (identity) return [`-c.mac.identity=${identity}`];
  if (process.env.CSC_LINK) return [];
  if (mode === "install") {
    const result = spawnSync(
      "/usr/bin/security",
      ["find-identity", "-v", "-p", "codesigning"],
      { encoding: "utf8" },
    );
    const identities = [
      ...(result.stdout ?? "").matchAll(
        /\b([0-9A-F]{40}) "Developer ID Application: [^"]+"/g,
      ),
    ];
    if (identities.length === 1) return [`-c.mac.identity=${identities[0][1]}`];
    if (identities.length > 1)
      throw new Error(
        "Multiple Developer ID certificates found. Set WALLACE_MAC_SIGNING_IDENTITY to the identity used for Wallace.",
      );
    console.warn(
      "No Developer ID signing identity found. This local build uses ad hoc signing, so macOS may ask for access again.",
    );
  }
  return ["-c.mac.identity=-", "-c.mac.hardenedRuntime=false"];
}

async function install(builtApp) {
  const suffix = randomUUID();
  const next = `/Applications/.wallace-next-${suffix}`;
  const previous = `/Applications/.wallace-previous-${suffix}`;
  const installed = await fs.lstat(destination).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (installed) {
    const result = spawnSync(
      "/usr/libexec/PlistBuddy",
      [
        "-c",
        "Print CFBundleIdentifier",
        path.join(destination, "Contents/Info.plist"),
      ],
      { encoding: "utf8" },
    );
    if (!installed.isDirectory() || result.stdout?.trim() !== bundleId)
      throw new Error(`기존 ${destination}의 앱 정보를 확인해 주세요.`);
  }
  let movedPrevious = false;
  try {
    run("/usr/bin/ditto", [builtApp, next]);
    run("/usr/bin/codesign", ["--verify", "--deep", next]);
    if (installed) verifyUpgradeIdentity(destination, next);
    appProcesses(true);
    for (let attempt = 0; attempt < 60 && appProcesses(); attempt++)
      await setTimeout(250);
    if (appProcesses())
      throw new Error("Wallace를 종료한 뒤 설치 명령을 다시 실행해 주세요.");
    if (installed) {
      await fs.rename(destination, previous);
      movedPrevious = true;
    }
    try {
      await fs.rename(next, destination);
    } catch (error) {
      if (movedPrevious) await fs.rename(previous, destination);
      throw error;
    }
    if (movedPrevious) await fs.rm(previous, { recursive: true });
    console.log(`Wallace 설치 완료 · ${destination}`);
  } finally {
    await fs.rm(next, { recursive: true, force: true });
  }
}

async function release() {
  if (mode === "pack" && process.platform !== "darwin") {
    run(process.execPath, [builder, "--dir", ...options]);
    return;
  }
  if (
    process.platform !== "darwin" ||
    !["release", "install", "pack"].includes(mode)
  )
    throw new Error(
      "macOS에서 release, install 또는 pack 모드를 실행해 주세요.",
    );
  if (options.some((option) => option.includes("directories.output")))
    throw new Error("Mac 빌드 중간 파일은 임시 폴더에 생성합니다.");
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-mac-"));
  try {
    run(process.execPath, [
      builder,
      "--mac",
      ...(mode === "pack" ? ["zip"] : []),
      ...options,
      `-c.directories.output=${stage}`,
      ...(mode === "install" ? ["--dir", "--publish", "never"] : []),
      ...signingOptions(),
    ]);
    const files = await fs.readdir(stage);
    if (mode === "install") {
      const arch = process.arch === "arm64" ? "mac-arm64" : "mac";
      await install(path.join(stage, arch, "Wallace.app"));
      return;
    }
    const output = path.resolve("release");
    await fs.mkdir(output, { recursive: true });
    for (const name of files.filter((name) =>
      /(?:\.pkg|\.dmg|\.zip|\.blockmap|^latest.*\.yml)$/.test(name),
    )) {
      const destination = path.join(output, name);
      const pending = destination + ".partial-" + randomUUID();
      try {
        await fs.copyFile(path.join(stage, name), pending);
        await fs.rename(pending, destination);
      } finally {
        await fs.rm(pending, { force: true });
      }
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

await release();
