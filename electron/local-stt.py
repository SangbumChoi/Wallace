"""Download a pinned multilingual Whisper model and transcribe locally."""
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel

REVISIONS = {
    "whisper-tiny": "d90ca5fe260221311c53c58e660288d3deb8d356",
    "whisper-base": "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66",
    "whisper-small": "536b0662742c02347bc0e980a01041f333bce120",
}
MODEL_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


def load_model(model_path):
    return WhisperModel(
        str(model_path), device="cpu", compute_type="int8", local_files_only=True
    )


def main():
    action, directory, *inputs = sys.argv[1:]
    model_path = Path(directory)
    if action == "download":
        from huggingface_hub import snapshot_download

        snapshot_download(
            f"Systran/faster-{model_path.name}",
            revision=REVISIONS[model_path.name],
            local_dir=model_path,
            allow_patterns=MODEL_FILES,
            token=False,
        )
        load_model(model_path)
    elif action == "transcribe":
        segments, _ = load_model(model_path).transcribe(
            inputs[0], beam_size=5, vad_filter=True
        )
        print(json.dumps({"text": " ".join(segment.text.strip() for segment in segments)}))
    else:
        raise ValueError("Unknown local speech operation")


if __name__ == "__main__":
    main()
