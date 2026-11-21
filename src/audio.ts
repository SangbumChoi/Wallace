export function createAudioRecorder(stream: MediaStream) {
  const mimeType = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((format) => MediaRecorder.isTypeSupported(format));
  if (!mimeType) throw new Error("No supported recording format was found.");
  return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
}

export async function speechAudio(blob: Blob) {
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mime: blob.type.split(";")[0],
  };
}
