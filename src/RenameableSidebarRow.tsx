import { useRef, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";

export default function RenameableSidebarRow({
  title,
  label,
  renameLabel,
  selected,
  icon,
  onOpen,
  onRename,
}: {
  title: string;
  label: string;
  renameLabel: string;
  selected: boolean;
  icon: ReactNode;
  onOpen: () => void;
  onRename: (title: string) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  function closeEditor() {
    setName(null);
    requestAnimationFrame(() => openButton.current?.focus());
  }

  if (name !== null) {
    return (
      <form
        className="sidebar-rename"
        onSubmit={(event) => {
          event.preventDefault();
          const value = name.trim();
          if (!value) return;
          if (value !== title) onRename(value);
          closeEditor();
        }}
      >
        <input
          aria-label={renameLabel}
          autoFocus
          maxLength={300}
          value={name}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              closeEditor();
            }
          }}
        />
        <button
          type="submit"
          aria-label="Save name"
          title="Save name"
          disabled={!name.trim()}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          aria-label="Cancel rename"
          title="Cancel rename"
          onClick={closeEditor}
        >
          <X size={14} />
        </button>
      </form>
    );
  }

  return (
    <div className={`renameable-sidebar-row ${selected ? "current" : ""}`}>
      <button
        ref={openButton}
        className="conversation-row"
        aria-label={label}
        title={title}
        onClick={onOpen}
      >
        {icon}
        <span>{title}</span>
      </button>
      <button
        type="button"
        className="sidebar-rename-button"
        aria-label={`${renameLabel}: ${title}`}
        title={renameLabel}
        onClick={() => setName(title)}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}
