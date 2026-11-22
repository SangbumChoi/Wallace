import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sharedWorkspace, mergeWorkspaces } from "../shared/cloud.mjs";
import { bridge } from "./bridge";
import type { CloudLink, CloudResult, Workspace } from "./types";

type Version = Extract<CloudResult, { status: 200 }>;

function fingerprint(workspace: Workspace) {
  const data = new TextEncoder().encode(JSON.stringify(workspace));
  return bytesToHex(sha256(data));
}

export default function useWorkspaceCloud({
  ready,
  workspaceId,
  workspace,
  getCurrent,
  apply,
}: {
  ready: boolean;
  workspaceId: string;
  workspace: Workspace;
  getCurrent: () => Workspace;
  apply: (workspace: Workspace) => void;
}) {
  const [link, setLink] = useState<CloudLink | null>(null);
  const [status, setStatus] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [availability, setAvailability] = useState<"empty" | "existing">();
  const running = useRef(false);
  const client = useMemo(() => bridge.cloudFor?.(workspaceId), [workspaceId]);

  useEffect(() => {
    if (!ready || !client) return;
    let active = true;
    client
      .link()
      .then((config) => {
        if (active) setLink(config);
      })
      .catch(() => {
        if (active) setStatus("Could not read the shared workspace settings.");
      });
    return () => {
      active = false;
    };
  }, [client, ready]);

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(
        (error as Error).message || "Could not connect to the shared server.",
      );
    } finally {
      setBusy(false);
      running.current = false;
    }
  }, []);

  const accept = useCallback(
    async (
      version: Version,
      config: CloudLink,
      sent?: Workspace,
      expected?: Workspace,
    ) => {
      if (!client) return;
      const remote = sharedWorkspace(version.workspace);
      const hash = fingerprint(remote);
      const current = getCurrent();
      if (expected && expected !== current)
        throw new Error("Changes were made on this device. Try again.");
      const local = sharedWorkspace(current);
      const merged = sent && mergeWorkspaces(sent, local, remote);
      if (merged && !merged.workspace) {
        setConflicts(merged.conflicts);
        setStatus("Some edits conflict. Your local changes were kept.");
        return;
      }
      const next = {
        ...(merged ? merged.workspace! : remote),
        ...(current.profile && { profile: current.profile }),
      };
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        apply(next);
        await bridge.save(next, workspaceId);
      }
      await client.checkpoint(version.revision, hash);
      setLink({ ...config, revision: version.revision, fingerprint: hash });
      setSavedAt(version.savedAt);
      setConflicts([]);
    },
    [apply, client, getCurrent, workspaceId],
  );

  const sync = useCallback(() => {
    if (!client || !link?.revision) return;
    void perform(async () => {
      const captured = getCurrent();
      const sent = sharedWorkspace(captured);
      const dirty = fingerprint(sent) !== link.fingerprint;
      const result = dirty
        ? await client.push(link.revision, sent)
        : await client.fetch({ since: link.revision });
      if (result.status === 409) {
        setConflicts(result.conflicts);
        setStatus("Some edits conflict. Your local changes were kept.");
      } else if (result.status === 200) {
        if (dirty || getCurrent() === captured)
          await accept(
            result,
            link,
            dirty ? sent : undefined,
            dirty ? undefined : captured,
          );
      } else if (result.status === 404) {
        throw new Error("Could not find a workspace on the server.");
      } else {
        setConflicts([]);
      }
    });
  }, [accept, client, getCurrent, link, perform]);

  useEffect(() => {
    if (!ready || !link?.revision || conflicts.length) return;
    const timer = setTimeout(sync, 1200);
    return () => clearTimeout(timer);
  }, [workspace, ready, link?.revision, conflicts.length, sync]);

  useEffect(() => {
    if (!ready || !link?.revision || conflicts.length) return;
    const timer = setInterval(() => {
      if (!document.hidden) sync();
    }, 8000);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
    };
  }, [ready, link?.revision, conflicts.length, sync]);

  function connect(url: string, key: string) {
    if (!client) return;
    void perform(async () => {
      setAvailability(undefined);
      await client.configure(url, key);
      const config = await client.link();
      if (!config) throw new Error("Could not connect to the shared server.");
      setLink(config);
      const result = await client.fetch();
      if (result.status === 404) {
        setAvailability("empty");
        setStatus("The server is empty. You can upload this workspace.");
      } else if (result.status === 200) {
        setAvailability("existing");
        setStatus("Shared workspace found. You can open it from the server.");
      }
    });
  }

  function publish() {
    if (!client || !link || link.revision) return;
    void perform(async () => {
      const sent = sharedWorkspace(getCurrent());
      const result = await client.push(0, sent);
      if (result.status === 200) await accept(result, link, sent);
      else {
        setAvailability("existing");
        throw new Error(
          "The server already has a workspace. Choose Open from server.",
        );
      }
    });
  }

  function openRemote() {
    if (!client || !link) return;
    if (
      !window.confirm(
        "Replace this workspace with the server version? Export a backup first if you want to keep a copy.",
      )
    )
      return;
    void perform(async () => {
      const captured = getCurrent();
      const result = await client.fetch();
      if (result.status !== 200)
        throw new Error("The server has no saved workspace.");
      await accept(result, link, undefined, captured);
    });
  }

  function exportRemote() {
    if (!client) return;
    void perform(async () => {
      const result = await client.fetch();
      if (result.status !== 200)
        throw new Error("The server has no saved workspace.");
      await bridge.export(result.workspace);
    });
  }

  function disconnect() {
    if (!client) return;
    void perform(async () => {
      await client.disconnect();
      setLink(null);
      setAvailability(undefined);
      setConflicts([]);
      setSavedAt("");
    });
  }

  return {
    link,
    busy,
    status,
    savedAt,
    conflicts,
    availability,
    connect,
    publish,
    openRemote,
    exportRemote,
    disconnect,
    sync,
  };
}
