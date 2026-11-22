const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const speechModels = ["whisper-tiny", "whisper-base", "whisper-small"];
function speechModel(value = "whisper-base") {
  if (!speechModels.includes(value))
    throw new Error("Choose a local Whisper model.");
  return value;
}

function localSpeech(root, worker) {
  const runtime = path.join(root, "runtime");
  const python = path.join(
    runtime,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const marker = (model) => path.join(root, `${model}.ready`);
  const env = {
    ...process.env,
    HF_HUB_DISABLE_TELEMETRY: "1",
    HF_HUB_DISABLE_XET: "1",
    HF_HUB_DISABLE_PROGRESS_BARS: "1",
    HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
    PYTHONNOUSERSITE: "1",
  };
  let download;
  let installing = null;
  let stage = null;
  const children = new Set();

  function run(executable, args, timeout, extraEnv = {}) {
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        {
          timeout,
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
          env: { ...env, ...extraEnv },
        },
        (error, stdout) => {
          children.delete(child);
          if (error) reject(error);
          else resolve(stdout);
        },
      );
      children.add(child);
    });
  }

  async function ready(model) {
    try {
      await Promise.all(
        [
          python,
          marker(model),
          ...[
            "config.json",
            "model.bin",
            "tokenizer.json",
            "vocabulary.txt",
          ].map((name) => path.join(root, model, name)),
        ].map((file) => fs.access(file)),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function bootstrap() {
    const candidates =
      process.platform === "win32"
        ? [["py", "-3.11"], ["py", "-3"], ["python"]]
        : [
            ["/opt/homebrew/opt/python@3.11/bin/python3.11"],
            ["/usr/local/bin/python3"],
            ["/opt/homebrew/bin/python3"],
            ["python3"],
          ];
    for (const [executable, ...prefix] of candidates) {
      try {
        await run(
          executable,
          [
            ...prefix,
            "-c",
            "import sys; sys.exit(not ((3, 9) <= sys.version_info[:2] <= (3, 14)))",
          ],
          5000,
        );
      } catch {
        continue;
      }
      await run(executable, [...prefix, "-m", "venv", runtime], 120000);
      return;
    }
    throw new Error(
      "Local speech-to-text requires Python 3.9–3.14. Install Python and try again.",
    );
  }

  async function install(model) {
    if (await ready(model)) return;
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    stage = "runtime";
    try {
      try {
        await run(python, ["-c", "import faster_whisper"], 20000);
      } catch {
        await bootstrap();
        await run(
          python,
          [
            "-m",
            "pip",
            "--isolated",
            "install",
            "--disable-pip-version-check",
            "--only-binary=:all:",
            "--index-url",
            "https://pypi.org/simple",
            "faster-whisper==1.2.1",
          ],
          600000,
        );
      }
    } catch (error) {
      if (!error.code && !error.killed) throw error;
      throw new Error(
        "Could not install the local speech engine. Check Python and your internet connection, then try again.",
      );
    }
    stage = "model";
    try {
      await run(python, [worker, "download", path.join(root, model)], 900000);
      await fs.writeFile(marker(model), "ready\n", { mode: 0o600 });
    } catch {
      throw new Error(
        "Could not prepare the Whisper model. Check your internet connection and available storage.",
      );
    }
  }

  return {
    async status() {
      const states = await Promise.all(speechModels.map(ready));
      const installed = speechModels.filter((_, index) => states[index]);
      return {
        ready: installed.includes("whisper-base"),
        installed,
        stage,
        installing,
      };
    },
    install(value) {
      const model = speechModel(value);
      if (download) {
        if (model === installing) return download;
        throw new Error(
          "Wait for the current model download to finish, then try again.",
        );
      }
      installing = model;
      download = install(model).finally(() => {
        stage = null;
        installing = null;
        download = undefined;
      });
      return download;
    },
    async transcribe(bytes, value) {
      const model = speechModel(value);
      if (!(await ready(model)))
        throw new Error("Download a Whisper model in Settings first.");
      const temporary = await fs.mkdtemp(
        path.join(os.tmpdir(), "wallace-recording-"),
      );
      try {
        const audio = path.join(temporary, "recording");
        await fs.writeFile(audio, bytes, { mode: 0o600 });
        const output = await run(
          python,
          [worker, "transcribe", path.join(root, model), audio],
          180000,
          { HF_HUB_OFFLINE: "1" },
        );
        const result = JSON.parse(output);
        if (typeof result.text !== "string")
          throw new Error("Invalid transcription");
        return result.text;
      } catch {
        throw new Error(
          "Could not transcribe the recording locally. Try splitting long recordings into shorter clips.",
        );
      } finally {
        await fs.rm(temporary, { recursive: true, force: true });
      }
    },
    stop() {
      for (const child of children) child.kill();
    },
  };
}

module.exports = { localSpeech, speechModel };
