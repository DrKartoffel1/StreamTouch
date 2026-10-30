import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Cable,
  Check,
  Download,
  Upload,
  RotateCcw,
  Keyboard,
  Palette,
  ImagePlus,
  Circle,
  X,
  Plus,
  Sparkles,
  Square,
  Images,
} from "lucide-react";
import { BackgroundControls } from "./components/BackgroundControls";
import { activeAssets, referencedAssets, appearanceReady } from "./background";
import { DevicePreview } from "./components/DevicePreview";
import { IconLibrary } from "./components/IconLibrary";
import { iconReferenced } from "./icon-library";
import { Button } from "./components/ui/button";
import {
  MAX_PAGES,
  canonical,
  editAction,
  freshConfig,
  parseConfig,
  themeLabels,
  type Config,
  type ThemeKey,
} from "./config";
import { presets } from "./presets";
import { themeStyle } from "./theme";
import { mapKey } from "./keys";
import { loadDraft, saveDraft } from "./draft";
import { stageIcon } from "./icons";
import { applyConfig, Device, serialAPI } from "./serial";
const media = {
  MEDIA_PLAY_PAUSE: "Play / pause",
  MEDIA_STOP: "Stop",
  MEDIA_NEXT: "Next track",
  MEDIA_PREV: "Previous track",
  MEDIA_VOLUME_MUTE: "Mute",
  MEDIA_VOLUME_UP: "Volume up",
  MEDIA_VOLUME_DOWN: "Volume down",
};
const apps = {
  APP_BROWSER: "Web browser",
  APP_CALCULATOR: "Calculator",
  APP_EMAIL: "Email",
  APP_FILE_EXPLORER: "File explorer",
};
type Connection =
  "disconnected" | "connecting" | "syncing" | "ready" | "applying" | "failed";
type Decision = { message: string; run: () => void };
function ColorField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setText(value);
  }
  const valid = /^#[\da-f]{6}$/i.test(text);
  return (
    <label className="color-field">
      <span>{name}</span>
      <span className="color-inputs">
        <input
          aria-label={`${name} color`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={`${name} hex`}
          value={text}
          aria-invalid={!valid}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[\da-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => {
            if (!valid) setText(value);
          }}
        />
      </span>
    </label>
  );
}
export default function App() {
  const [config, setConfig] = useState<Config>(freshConfig);
  const [baseline, setBaseline] = useState<Config>(freshConfig);
  const [icons, setIcons] = useState<Record<string, Blob>>({});
  const [deviceIcons, setDeviceIcons] = useState<Record<string, Blob>>({});
  const [preparingBackground, setPreparingBackground] = useState(false);
  const [deletingIcon, setDeletingIcon] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelected] = useState(0);
  const selected = Math.min(selection, config.tiles.length - 1);
  const page = Math.floor(selected / 8);
  const pageCount = config.tiles.length / 8;
  const [tab, setTab] = useState<"button" | "theme" | "icons">("button");
  const [connection, setConnection] = useState<Connection>("disconnected");
  const [notice, setNotice] = useState(
    "Your workspace, your shortcuts. Start editing or connect a device.",
  );
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [preset, setPreset] = useState("Kartoffel");
  const [presetName, setPresetName] = useState("");
  const [decision, setDecision] = useState<Decision>();
  const [pressed, setPressed] = useState(false);
  const device = useRef<Device | null>(null);
  const operation = useRef(0);
  const alive = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const tile = config.tiles[selected];
  const action = tile.actions?.[0] || { type: "keys", keys: [] };
  const assetReferences = referencedAssets(config);
  const dirty =
    canonical(config) !== canonical(baseline) ||
    Object.keys(icons).some((p) => assetReferences.has(p));
  const busy =
    !loaded ||
    deletingIcon ||
    preparingBackground ||
    ["connecting", "syncing", "applying"].includes(connection);
  const supported = !!serialAPI();
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void loadDraft()
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setConfig(parseConfig(JSON.stringify(d.config)));
          setBaseline(parseConfig(JSON.stringify(d.baseline)));
          setIcons(d.icons);
          setNotice("Your local draft has been restored.");
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Local storage is unavailable. Export your draft before leaving.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      // Incrementing a request-generation counter, not reading a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      operation.current++;
      void device.current?.close().catch(() => {});
      device.current = null;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      void saveDraft({ config, baseline, icons }).catch(() =>
        setError("Could not save locally. Export your draft before leaving."),
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [config, baseline, icons, loaded]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!decision) return;
    dialog.current?.showModal();
  }, [decision]);
  useEffect(() => {
    if (!recording) return;
    const record = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setRecording(false);
        return;
      }
      if (e.repeat) return;
      const key = mapKey(e);
      if (key)
        setConfig((c) => {
          const tiles = [...c.tiles];
          const t = tiles[selected];
          const a = t.actions?.[0] || { type: "keys", keys: [] };
          tiles[selected] = editAction(t, {
            type: "keys",
            keys: [...a.keys, key],
          });
          return { ...c, tiles };
        });
      else setNotice("That key cannot be mapped by the current firmware.");
    };
    const stop = () => setRecording(false);
    window.addEventListener("keydown", record, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", record, true);
      window.removeEventListener("blur", stop);
    };
  }, [recording, selected]);
  function selectPage(next: number) {
    setRecording(false);
    setSelected(next * 8);
  }
  function updateTile(patch: Partial<typeof tile>) {
    setConfig((c) => ({
      ...c,
      tiles: c.tiles.map((t, i) => (i === selected ? { ...t, ...patch } : t)),
    }));
  }
  function updateAction(type: string, keys: string[]) {
    updateTile(editAction(tile, { type, keys }));
  }
  function confirm(message: string, run: () => void) {
    setDecision({ message, run });
  }
  function report(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
  }
  async function disconnect() {
    operation.current++;
    const d = device.current;
    device.current = null;
    setRecording(false);
    try {
      await d?.close();
    } catch (e) {
      report(e);
    }
    setConnection("disconnected");
    setNotice("Disconnected. Your draft is kept locally.");
  }
  async function connect() {
    if (busy) return;
    setError("");
    setRecording(false);
    const token = ++operation.current;
    let d: Device | null = null;
    try {
      setConnection("connecting");
      const port = await serialAPI()!.requestPort();
      if (token !== operation.current) return;
      d = new Device(port, (e) => {
        if (token !== operation.current || !alive.current) return;
        setError(e.message + " Your draft is retained.");
        setConnection("failed");
        const lost = device.current;
        device.current = null;
        void lost?.close().catch(() => {});
      });
      device.current = d;
      await d.open();
      if (token !== operation.current) {
        await d.close().catch(() => {});
        return;
      }
      setConnection("syncing");
      setNotice("Fetching data from device…");
      await new Promise((r) => setTimeout(r, 2000));
      let raw: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          raw = await d.getConfig();
          break;
        } catch (e) {
          if (attempt === 2) throw e;
        }
      }
      if (token !== operation.current) return;
      const incoming = parseConfig(JSON.stringify(raw));
      const draftDirty = dirty;
      const adopt = () => {
        setConfig(incoming);
        setBaseline(incoming);
        setIcons({});
      };
      if (draftDirty) {
        setBaseline(incoming);
      } else adopt();
      const fetched: Record<string, Blob> = {};
      for (const path of activeAssets(incoming)) {
        try {
          const bytes = await d.getFile(path);
          if (bytes.length)
            fetched[path] = new Blob([new Uint8Array(bytes)], {
              type: path.startsWith("/backgrounds/")
                ? "image/jpeg"
                : "image/png",
            });
        } catch (e) {
          if (token === operation.current) {
            report(e);
            setConnection("failed");
            setNotice(
              "Device data could not be fully loaded. Reconnect to retry.",
            );
            device.current = null;
            await d.close().catch(() => {});
          }
          break;
        }
      }
      if (token === operation.current && device.current) {
        setDeviceIcons(fetched);
        setConnection("ready");
        setNotice(
          draftDirty
            ? "Connected. Your local draft is retained; Apply will replace the device configuration."
            : "Device configuration loaded. Changes stay local until Apply.",
        );
      }
    } catch (e) {
      if (token !== operation.current) return;
      report(e);
      setConnection("failed");
      setNotice("Device connection failed. Your local draft is retained.");
      device.current = null;
      await d?.close().catch(() => {});
    }
  }
  async function apply() {
    if (!device.current || busy) return;
    const token = operation.current;
    setError("");
    setRecording(false);
    setConnection("applying");
    try {
      await applyConfig(device.current, config, icons, setNotice);
      if (token !== operation.current) return;
      setBaseline(structuredClone(config));
      setDeviceIcons({ ...deviceIcons, ...icons });
      setIcons({});
      setConnection("ready");
      setNotice("Saved to device and verified. All changes are up to date.");
    } catch (e) {
      if (token !== operation.current) return;
      report(e);
      setConnection("failed");
      await device.current?.close().catch(() => {});
      device.current = null;
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const incoming = parseConfig(await file.text());
      const run = () => {
        setConfig(incoming);
        setIcons({});
        setNotice(
          "JSON imported as a draft. Icon files are separate; add them in the Button tab.",
        );
      };
      if (dirty)
        confirm(
          "Replace your local draft with this JSON? Export it first if you want to keep it.",
          run,
        );
      else run();
    } catch (e) {
      report(e);
    }
  }
  async function addIcon(file?: File) {
    if (!file) return;
    try {
      const staged = await stageIcon(file);
      setIcons((c) => ({ ...c, [staged.path]: staged.blob }));
      updateTile({ icon: staged.path });
      setNotice("Icon staged locally. Apply to Device will upload it.");
    } catch (e) {
      report(e);
    }
  }
  function exportJSON() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "macros.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("JSON exported. Icon image files are separate from this file.");
  }
  const changeSurface = useCallback(
    (patch: Partial<import("./config").Theme>) =>
      setConfig((c) => ({ ...c, theme: { ...c.theme, ...patch } })),
    [],
  );
  const stageBackground = useCallback(
    (path: string, blob: Blob, patch: Partial<import("./config").Theme>) => {
      setIcons((c) => ({ ...c, [path]: blob }));
      setConfig((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
    },
    [],
  );
  const listStoredIcons = useCallback(async () => {
    const d = device.current,
      token = operation.current;
    if (!d) throw Error("Connect the device first.");
    const files = await d.listIcons();
    if (token !== operation.current)
      throw Error("Device connection changed. Refresh after reconnecting.");
    return files;
  }, []);
  const readStoredIcon = useCallback(async (path: string) => {
    const d = device.current,
      token = operation.current;
    if (!d) throw Error("Connect the device first.");
    const bytes = await d.getFile(path);
    if (token !== operation.current || !bytes.length)
      throw Error("Icon preview unavailable.");
    const blob = new Blob([new Uint8Array(bytes)], {
      type: path.startsWith("/backgrounds/") ? "image/jpeg" : "image/png",
    });
    setDeviceIcons((c) => ({ ...c, [path]: blob }));
    return blob;
  }, []);
  const deleteStoredIcon = useCallback(
    async (path: string) => {
      if (iconReferenced(path, config) || iconReferenced(path, baseline))
        throw Error("Unassign this icon and Apply before deleting it.");
      const d = device.current,
        token = operation.current;
      if (!d) throw Error("Connect the device first.");
      setDeletingIcon(true);
      setNotice("Deleting unused icon from the SD card…");
      try {
        await d.deleteIcon(path);
        if (token !== operation.current)
          throw Error("Device connection changed. Refresh to verify deletion.");
        setDeviceIcons((c) => {
          const next = { ...c };
          delete next[path];
          return next;
        });
        setNotice("Unused icon deleted from the SD card.");
      } catch (error) {
        setNotice(
          "Icon deletion was not confirmed. Refresh the library to check the device.",
        );
        throw error;
      } finally {
        setDeletingIcon(false);
      }
    },
    [config, baseline],
  );
  return (
    <div
      className="workspace"
      style={themeStyle(config.theme) as CSSProperties}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar glass">
        <a className="brand" href="#main">
          <span className="brand-mark">
            <Sparkles size={23} />
          </span>
          <span>
            StreamTouch<small>STUDIO / CONFIGURATOR</small>
          </span>
        </a>
        <div className="header-actions">
          <span className={`connection ${connection}`}>
            <Circle size={8} fill="currentColor" />
            {connection}
          </span>
        </div>
      </header>
      <main id="main">
        <section
          className="device-actions"
          aria-label="Device connection and saving"
        >
          <div
            className={`action-card glass ${connection !== "ready" ? "action-current" : ""}`}
          >
            <p className="eyebrow">01 / CONNECT</p>
            <h1>
              {connection === "ready"
                ? "StreamTouch connected"
                : connection === "connecting" || connection === "syncing"
                  ? "Connecting your device…"
                  : "Connect your StreamTouch"}
            </h1>
            <p>
              {connection === "ready"
                ? "Edit your buttons, theme and icons below."
                : supported
                  ? "Plug in your device with USB, then connect to load its configuration."
                  : "Use desktop Chrome or Edge for USB access. You can still edit and import JSON here."}
            </p>
            <Button
              className="connect-primary"
              disabled={busy || !supported}
              onClick={() => {
                if (device.current) void disconnect();
                else if (dirty)
                  confirm(
                    "Connect while keeping your draft? Apply will overwrite the connected device with your draft.",
                    () => void connect(),
                  );
                else void connect();
              }}
            >
              <Cable size={16} />
              {connection === "ready" || connection === "applying"
                ? "Disconnect"
                : "Connect device"}
            </Button>
          </div>
          <div
            className={`action-card glass ${connection === "ready" && dirty ? "action-current" : ""}`}
          >
            <p className="eyebrow">02 / APPLY</p>
            <h2>Send your changes</h2>
            <p>
              {connection !== "ready"
                ? "Connect a device first. Your edits stay safely in this browser."
                : dirty
                  ? "Your changes are ready. Apply them to update your device."
                  : "Your device is up to date. Edit below to make changes."}
            </p>
            <Button
              className="apply-primary"
              disabled={
                busy ||
                connection !== "ready" ||
                !dirty ||
                !appearanceReady(config.theme)
              }
              onClick={() => void apply()}
            >
              <Check size={16} />
              Apply to Device
            </Button>
          </div>
        </section>
        <section
          className="workspace-toolbar"
          aria-label="Configuration files and draft"
        >
          <div className="workspace-tools">
            <span className="draft-status">
              <span className={dirty ? "dot pending" : "dot"} />
              {dirty ? "Unapplied changes" : "Up to date"}
            </span>
            <div className="tool-row">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => importInput.current?.click()}
              >
                <Upload size={15} />
                Import JSON
              </Button>
              <Button variant="outline" disabled={!loaded} onClick={exportJSON}>
                <Download size={15} />
                Export JSON
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !dirty}
                onClick={() =>
                  confirm(
                    "Discard all pending changes and return to the last loaded or verified configuration?",
                    () => {
                      setConfig(structuredClone(baseline));
                      setIcons({});
                      setNotice("Pending changes discarded.");
                    },
                  )
                }
              >
                <RotateCcw size={15} />
                Discard
              </Button>
            </div>
            <input
              ref={importInput}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </section>
        {!supported && (
          <aside className="compatibility">
            <Cable size={18} />
            <p>
              This browser supports editing and JSON import/export. Use desktop
              Chrome or Edge to connect to StreamTouch over USB.
            </p>
          </aside>
        )}
        <div className="feedback" role="status" aria-live="polite">
          {busy ? <span className="spinner" /> : <Check size={15} />}
          <span>
            {!loaded
              ? "Restoring your workspace…"
              : connection === "syncing"
                ? "Fetching data from device…"
                : preparingBackground
                  ? "Preparing background preview…"
                  : notice}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <Button
              variant="ghost"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </Button>
          </div>
        )}
        <div className="editor-layout">
          <section className="preview-panel glass" aria-label="Device preview">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR DEVICE</p>
                <h2>Device screen</h2>
              </div>
              <span className="badge">8 KEYS · 4 × 2</span>
            </div>
            <div className="page-preview">
              <Button
                aria-label="Previous page"
                disabled={busy || page === 0}
                onClick={() => selectPage(page - 1)}
              >
                ‹
              </Button>
              <DevicePreview
                config={config}
                icons={{ ...deviceIcons, ...icons }}
                selected={selected}
                pressed={pressed}
                disabled={busy}
                onSelect={(slot) => {
                  setSelected(slot);
                  setRecording(false);
                }}
              />
              <Button
                aria-label={page + 1 < pageCount ? "Next page" : "Add page"}
                disabled={
                  busy || (page + 1 === pageCount && pageCount === MAX_PAGES)
                }
                onClick={() => {
                  if (page + 1 === pageCount)
                    setConfig((c) => ({
                      ...c,
                      tiles: [
                        ...c.tiles,
                        ...Array.from({ length: 8 }, () => ({})),
                      ],
                    }));
                  selectPage(page + 1);
                }}
              >
                {page + 1 < pageCount ? "›" : "+"}
              </Button>
            </div>
            <div className="page-controls">
              <span aria-live="polite">
                Page {page + 1} of {pageCount}
              </span>
              <Button
                disabled={busy || pageCount === 1}
                onClick={() =>
                  confirm(
                    `Delete page ${page + 1} and its eight buttons?`,
                    () => {
                      setConfig((c) => ({
                        ...c,
                        tiles: c.tiles.filter(
                          (_, i) => Math.floor(i / 8) !== page,
                        ),
                      }));
                      selectPage(Math.min(page, pageCount - 2));
                    },
                  )
                }
              >
                Delete page
              </Button>
            </div>
            <div className="preview-footer">
              <p>
                <span className="dot" />
                Editing button {selected + 1} · preview of the current firmware
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={pressed}
                  onChange={(e) => setPressed(e.target.checked)}
                />
                Pressed state
              </label>
            </div>
            <div className="workflow-hint">
              <span className="hint-number">01</span>
              <p>
                <strong>Design here. Apply when ready.</strong>
                <br />
                Your device stays unchanged while you explore.
              </p>
            </div>
          </section>
          <section
            className="inspector glass"
            aria-label="Configuration editor"
          >
            <div className="tabs" role="tablist" aria-label="Editor sections">
              {(
                [
                  { id: "button", label: "Button", Icon: Keyboard },
                  { id: "theme", label: "Theme", Icon: Palette },
                  { id: "icons", label: "Icons", Icon: Images },
                ] as const
              ).map(({ id, label, Icon }, index) => (
                <button
                  key={id}
                  role="tab"
                  id={`${id}-tab`}
                  aria-selected={tab === id}
                  aria-controls={`${id}-panel`}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(event) => {
                    const ids = ["button", "theme", "icons"] as const;
                    let next: number | undefined;
                    if (event.key === "ArrowRight") next = (index + 1) % 3;
                    if (event.key === "ArrowLeft") next = (index + 2) % 3;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = 2;
                    if (next !== undefined) {
                      event.preventDefault();
                      setTab(ids[next]);
                      setRecording(false);
                      document.getElementById(`${ids[next]}-tab`)?.focus();
                    }
                  }}
                  onClick={() => {
                    setTab(id);
                    setRecording(false);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            {tab === "button" ? (
              <div
                role="tabpanel"
                id="button-panel"
                aria-labelledby="button-tab"
              >
                <fieldset disabled={busy}>
                  <div className="inspector-heading">
                    <span className="slot-tag">
                      {String(selected + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2>Button settings</h2>
                      <p>A shortcut that feels like you.</p>
                    </div>
                  </div>
                  <label className="field">
                    Button label
                    <input
                      value={tile.label || ""}
                      placeholder={`Button ${selected + 1}`}
                      onChange={(e) => updateTile({ label: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>
                      <input
                        type="checkbox"
                        checked={tile.repeat === true}
                        onChange={(e) =>
                          updateTile({ repeat: e.target.checked })
                        }
                      />{" "}
                      Repeat while held
                    </span>
                    <small>
                      Starts after a short hold. Repeats any configured shortcut
                      or action until you lift or slide away.
                    </small>
                  </label>
                  <label className="field">
                    Action type
                    <select
                      aria-label="Action type"
                      value={action.type}
                      onChange={(e) => {
                        setRecording(false);
                        updateAction(
                          e.target.value,
                          e.target.value === "media"
                            ? ["MEDIA_PLAY_PAUSE"]
                            : e.target.value === "application"
                              ? ["APP_BROWSER"]
                              : [],
                        );
                      }}
                    >
                      {!["keys", "media", "application"].includes(
                        action.type,
                      ) && (
                        <option value={action.type}>
                          {action.type} (preserved)
                        </option>
                      )}
                      <option value="keys">Keyboard shortcut</option>
                      <option value="media">Media control</option>
                      <option value="application">Launch application</option>
                    </select>
                  </label>
                  {action.type === "keys" ? (
                    <div className="shortcut-editor">
                      <div className="field-heading">
                        <span>Keys</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!recording) updateAction("keys", []);
                            setRecording(!recording);
                          }}
                        >
                          {recording ? (
                            <Square size={13} />
                          ) : (
                            <Keyboard size={13} />
                          )}{" "}
                          {recording ? "Stop recording" : "Record shortcut"}
                        </Button>
                      </div>
                      {recording && (
                        <p className="recording" role="status">
                          Press your keys. Escape stops recording.
                        </p>
                      )}
                      <div className="key-list">
                        {action.keys.map((key, i) => (
                          <div className="key-row" key={i}>
                            <input
                              aria-label={`Key ${i + 1}`}
                              value={key}
                              placeholder="LEFT_CTRL, A, F1…"
                              onChange={(e) =>
                                updateAction(
                                  "keys",
                                  action.keys.map((k, n) =>
                                    n === i ? e.target.value : k,
                                  ),
                                )
                              }
                            />
                            <Button
                              variant="ghost"
                              aria-label={`Remove key ${i + 1}`}
                              onClick={() =>
                                updateAction(
                                  "keys",
                                  action.keys.filter((_, n) => n !== i),
                                )
                              }
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateAction("keys", [...action.keys, ""])
                        }
                      >
                        <Plus size={14} />
                        Add key
                      </Button>
                      <p className="help">
                        Keys are sent together as a shortcut. Browser or OS
                        shortcuts may not be recordable.
                      </p>
                    </div>
                  ) : ["media", "application"].includes(action.type) ? (
                    <label className="field">
                      {action.type === "media" ? "Media action" : "Application"}
                      <select
                        aria-label={
                          action.type === "media"
                            ? "Media action"
                            : "Application"
                        }
                        value={action.keys[0] || ""}
                        onChange={(e) =>
                          updateAction(action.type, [
                            e.target.value,
                            ...action.keys.slice(1),
                          ])
                        }
                      >
                        {!Object.keys(
                          action.type === "media" ? media : apps,
                        ).includes(action.keys[0]) && (
                          <option value={action.keys[0] || ""}>
                            {action.keys[0] || "Select action"}
                          </option>
                        )}
                        {Object.entries(
                          action.type === "media" ? media : apps,
                        ).map(([k, v]) => (
                          <option value={k} key={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="help">
                      This action is preserved. Choose a supported type to
                      replace its first entry.
                    </p>
                  )}
                  {(tile.actions?.length || 0) > 1 && (
                    <p className="help">
                      Additional action entries are preserved.
                    </p>
                  )}
                  <div className="icon-section">
                    <div className="field-heading">
                      <span>Button icon</span>
                      {tile.icon && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateTile({ icon: undefined })}
                        >
                          <X size={13} />
                          Remove
                        </Button>
                      )}
                    </div>
                    <label
                      className="dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!busy) void addIcon(e.dataTransfer.files[0]);
                      }}
                    >
                      <ImagePlus size={25} />
                      <strong>Drop a PNG, or choose a file</strong>
                      <span>Up to 32 KiB · uploaded only on Apply</span>
                      <input
                        aria-label="Choose icon PNG"
                        type="file"
                        accept="image/png"
                        onChange={(e) => {
                          void addIcon(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {tile.icon && <p className="icon-path">{tile.icon}</p>}
                    <p className="help">
                      Removing an icon clears its assignment. Files on the SD
                      card are kept to protect shared icons.
                    </p>
                  </div>
                </fieldset>
              </div>
            ) : tab === "theme" ? (
              <div role="tabpanel" id="theme-panel" aria-labelledby="theme-tab">
                <fieldset disabled={busy}>
                  <div className="inspector-heading">
                    <span className="slot-tag">
                      <Palette size={20} />
                    </span>
                    <div>
                      <h2>Set the atmosphere</h2>
                      <p>One theme. Your entire workspace.</p>
                    </div>
                  </div>
                  <label className="field">
                    Theme preset
                    <select
                      aria-label="Theme preset"
                      value={preset}
                      onChange={(e) => setPreset(e.target.value)}
                    >
                      {Object.keys(config.theme_presets).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <div className="preset-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const desired = config.theme_presets[preset];
                        if (desired && device.current) {
                          setPreparingBackground(true);
                          try {
                            const assets: Record<string, Blob> = {};
                            for (const path of [
                              desired.background_image,
                              desired.background_blur_image,
                            ])
                              if (path && !icons[path] && !deviceIcons[path]) {
                                const bytes =
                                  await device.current.getFile(path);
                                if (bytes.length)
                                  assets[path] = new Blob(
                                    [new Uint8Array(bytes)],
                                    { type: "image/jpeg" },
                                  );
                              }
                            setDeviceIcons((c) => ({ ...c, ...assets }));
                          } catch (e) {
                            report(e);
                          } finally {
                            setPreparingBackground(false);
                          }
                        }
                        if (config.theme_presets[preset])
                          setConfig({
                            ...config,
                            theme: structuredClone(
                              config.theme_presets[preset],
                            ),
                          });
                      }}
                    >
                      Load preset
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfig({
                          ...config,
                          theme: structuredClone(presets.Kartoffel),
                        })
                      }
                    >
                      Restore default
                    </Button>
                  </div>
                  <h3>Normal state</h3>
                  {(Object.keys(themeLabels) as ThemeKey[])
                    .slice(0, 5)
                    .map((k) => (
                      <ColorField
                        key={k}
                        name={themeLabels[k]}
                        value={config.theme[k]}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            theme: { ...config.theme, [k]: v },
                          })
                        }
                      />
                    ))}
                  <h3>Pressed state</h3>
                  {(Object.keys(themeLabels) as ThemeKey[])
                    .slice(5)
                    .map((k) => (
                      <ColorField
                        key={k}
                        name={themeLabels[k]}
                        value={config.theme[k]}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            theme: { ...config.theme, [k]: v },
                          })
                        }
                      />
                    ))}
                  <BackgroundControls
                    theme={config.theme}
                    assets={{ ...deviceIcons, ...icons }}
                    disabled={busy}
                    onChange={changeSurface}
                    onStage={stageBackground}
                    onProcessing={setPreparingBackground}
                    onRead={readStoredIcon}
                    connected={connection === "ready"}
                  />
                  <div className="preset-save">
                    <label className="field">
                      Save your palette
                      <input
                        placeholder="Preset name"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="outline"
                      disabled={
                        !presetName.trim() || presetName.trim() in presets
                      }
                      onClick={() => {
                        const name = presetName.trim();
                        setConfig({
                          ...config,
                          theme_presets: {
                            ...config.theme_presets,
                            [name]: structuredClone(config.theme),
                          },
                        });
                        setPreset(name);
                        setPresetName("");
                      }}
                    >
                      Save preset
                    </Button>
                  </div>
                  {!(preset in presets) && (
                    <div className="preset-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfig({
                            ...config,
                            theme_presets: {
                              ...config.theme_presets,
                              [preset]: structuredClone(config.theme),
                            },
                          })
                        }
                      >
                        Update preset
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const remaining = { ...config.theme_presets };
                          delete remaining[preset];
                          setConfig({ ...config, theme_presets: remaining });
                          setPreset("Kartoffel");
                        }}
                      >
                        Delete preset
                      </Button>
                    </div>
                  )}
                </fieldset>
              </div>
            ) : (
              <div role="tabpanel" id="icons-panel" aria-labelledby="icons-tab">
                <IconLibrary
                  key={connection === "ready" ? "connected" : "offline"}
                  connected={connection === "ready"}
                  locked={busy}
                  config={config}
                  baseline={baseline}
                  onList={listStoredIcons}
                  onRead={readStoredIcon}
                  onDelete={deleteStoredIcon}
                />
              </div>
            )}
          </section>
        </div>
        <footer className="page-footer">
          <span>STREAMTOUCH STUDIO</span>
          <span>Made for your flow. Stored in your browser.</span>
          <span>JSON exports reference separate icon files.</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setDecision(undefined)}
        onClose={() => setDecision(undefined)}
      >
        <h2>Keep your work safe</h2>
        <p>{decision?.message}</p>
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => {
              dialog.current?.close();
              setDecision(undefined);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              const run = decision?.run;
              dialog.current?.close();
              setDecision(undefined);
              run?.();
            }}
          >
            Continue
          </Button>
        </div>
      </dialog>
    </div>
  );
}
