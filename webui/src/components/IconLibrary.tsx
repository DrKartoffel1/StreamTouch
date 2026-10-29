import { useEffect, useRef, useState } from "react";
import { Images, RefreshCw, Trash2, ImageOff } from "lucide-react";
import { Button } from "./ui/button";
import { iconReferenced, type StoredIcon } from "../icon-library";
import type { Config } from "../config";
function Thumbnail({
  path,
  onRead,
}: {
  path: string;
  onRead: (path: string) => Promise<Blob>;
}) {
  const element = useRef<HTMLImageElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let url = "";
    void onRead(path)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        if (element.current) element.current.src = url;
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, onRead]);
  return error ? (
    <span className="thumbnail-missing" title="Preview unavailable">
      <ImageOff size={20} />
    </span>
  ) : (
    <img
      ref={element}
      className="library-thumbnail"
      alt=""
      onError={() => setError(true)}
    />
  );
}
export function IconLibrary({
  connected,
  locked,
  config,
  baseline,
  onList,
  onRead,
  onDelete,
}: {
  connected: boolean;
  locked: boolean;
  config: Config;
  baseline: Config;
  onList: () => Promise<StoredIcon[]>;
  onRead: (path: string) => Promise<Blob>;
  onDelete: (path: string) => Promise<void>;
}) {
  const [files, setFiles] = useState<StoredIcon[] | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<StoredIcon | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (!connected) return;
    const token = ++generation.current;
    void onList()
      .then((result) => {
        if (token === generation.current) setFiles(result);
      })
      .catch((e) => {
        if (token === generation.current) {
          setError(e instanceof Error ? e.message : String(e));
          setFiles([]);
        }
      });
    return () => {
      // This is a request-generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [connected, onList]);
  async function refresh() {
    const token = ++generation.current;
    setWorking(true);
    setError("");
    try {
      const result = await onList();
      if (token === generation.current) {
        setFiles(result);
        setPage(0);
      }
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === generation.current) setWorking(false);
    }
  }
  async function remove() {
    if (!pending) return;
    const path = pending.path;
    dialog.current?.close();
    setPending(null);
    setWorking(true);
    setError("");
    try {
      if (
        pending.in_use ||
        iconReferenced(path, config) ||
        iconReferenced(path, baseline)
      )
        throw Error("Unassign this icon and Apply before deleting it.");
      await onDelete(path);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }
  if (!connected)
    return (
      <div className="library-disconnected">
        <Images size={28} />
        <h2>Icons on your device</h2>
        <p>
          Connect your StreamTouch to browse the PNGs stored in its /icons
          folder.
        </p>
        <p className="help">
          Uploading a replacement keeps the old file. Nothing is deleted
          automatically.
        </p>
      </div>
    );
  const total = files?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / 12));
  return (
    <div className="icon-library">
      <div className="inspector-heading">
        <span className="slot-tag">
          <Images size={20} />
        </span>
        <div>
          <h2>Device icons</h2>
          <p>
            Stored on the SD card · {total} PNG{total === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="library-toolbar">
        <p className="help">Browse /icons and its subfolders.</p>
        <Button
          variant="outline"
          size="sm"
          disabled={working || locked || files === null}
          onClick={() => void refresh()}
        >
          <RefreshCw size={13} />
          Refresh icons
        </Button>
      </div>
      {files === null && (
        <p role="status" className="help">
          Reading the device icon library…
        </p>
      )}
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
      {files && !files.length && !error && (
        <p className="library-empty">
          No PNG icons are stored on this device yet.
        </p>
      )}
      <div className="library-grid">
        {files?.slice(page * 12, page * 12 + 12).map((file) => {
          const saved = file.in_use || iconReferenced(file.path, baseline),
            draft = iconReferenced(file.path, config),
            used = saved || draft;
          return (
            <article className="library-card" key={file.path}>
              <div className="library-image">
                {file.size > 1024 * 1024 ? (
                  <ImageOff size={20} />
                ) : (
                  <Thumbnail path={file.path} onRead={onRead} />
                )}
              </div>
              <strong>{file.path.slice(file.path.lastIndexOf("/") + 1)}</strong>
              <span className="library-path">{file.path}</span>
              <span className="library-meta">
                {(file.size / 1024).toFixed(1)} KiB ·{" "}
                {saved ? "Used on device" : draft ? "Used in draft" : "Unused"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={used || working || locked}
                aria-label={`Delete ${file.path}`}
                title={
                  used
                    ? "Unassign the icon and Apply before deleting it."
                    : "Permanently delete this unused file from the SD card"
                }
                onClick={() => {
                  setPending(file);
                  dialog.current?.showModal();
                }}
              >
                <Trash2 size={13} />
                Delete file
              </Button>
            </article>
          );
        })}
      </div>
      {total > 12 && (
        <div className="library-pagination">
          <Button
            variant="ghost"
            size="sm"
            disabled={!page || working}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= pageCount || working}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <p className="help">
        Used icons are protected. Unassign them in Button settings and Apply to
        Device first. Deleting a file is permanent and happens immediately after
        confirmation.
      </p>
      <dialog
        ref={dialog}
        onCancel={() => setPending(null)}
        onClose={() => setPending(null)}
      >
        <h2>Delete stored icon?</h2>
        <p>
          Permanently delete <strong>{pending?.path}</strong> from the device SD
          card? This cannot be undone and is separate from Apply.
        </p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button className="button-danger" onClick={() => void remove()}>
            Delete permanently
          </Button>
        </div>
      </dialog>
    </div>
  );
}
