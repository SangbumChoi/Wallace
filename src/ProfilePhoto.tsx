import { useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";

export default function ProfilePhoto({
  photo,
  fallback,
  busy,
  onChange,
  onLoading,
}: {
  photo?: string;
  fallback: ReactNode;
  busy: boolean;
  onChange: (value: string | undefined) => void;
  onLoading: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");

  async function loadPhoto(file: File) {
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10_000_000
    ) {
      setError("Choose a JPG, PNG, or WebP image up to 10 MB.");
      return;
    }
    onLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      if (!size) throw new Error();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 160;
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 160, 160);
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        160,
        160,
      );
      onChange(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setError("Could not read the photo.");
    } finally {
      URL.revokeObjectURL(url);
      onLoading(false);
    }
  }

  return (
    <div className="profile-photo">
      <div className="profile-photo-preview">
        {photo ? (
          <img src={photo} alt="Profile photo preview" />
        ) : (
          <span aria-hidden="true">{fallback}</span>
        )}
      </div>
      <div className="profile-photo-details">
        <strong>Profile photo</strong>
        <p>JPG, PNG, WebP · Up to 10 MB</p>
        <input
          ref={input}
          hidden
          type="file"
          aria-label="Profile photo file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void loadPhoto(file);
          }}
        />
        <div className="profile-photo-actions">
          <button
            type="button"
            ref={chooseButton}
            className="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={15} aria-hidden="true" />
            {busy ? "Reading…" : photo ? "Change photo" : "Choose photo"}
          </button>
          {photo && (
            <button
              type="button"
              className="profile-photo-remove"
              disabled={busy}
              onClick={() => {
                setError("");
                onChange(undefined);
                chooseButton.current?.focus();
              }}
            >
              Remove photo
            </button>
          )}
        </div>
        {error && (
          <p className="profile-photo-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
