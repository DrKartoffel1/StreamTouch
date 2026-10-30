import {
  referencedAssets,
  hasVisualSettings,
  appearanceReady,
} from "./background";
import { canonical, safePath, type Config } from "./config";
import {
  parseIconList,
  isManagedIcon,
  IconLibraryUnavailable,
} from "./icon-library";
export type SerialEvent =
  | { type: "json"; value: unknown }
  | { type: "file"; path: string; bytes: Uint8Array }
  | { type: "ok" }
  | { type: "error"; message: string }
  | { type: "icons"; value: unknown }
  | { type: "deleted"; value: unknown }
  | { type: "caps"; value: unknown }
  | { type: "upload"; value: unknown }
  | { type: "render"; value: unknown };
export class SerialParser {
  private buffer = new Uint8Array(0);
  private file: { path: string; size: number } | null = null;
  private json = "";
  private jsonType:
    "json" | "icons" | "deleted" | "caps" | "upload" | "render" = "json";
  constructor(private emit: (e: SerialEvent) => void) {}
  push(bytes: Uint8Array) {
    const next = new Uint8Array(this.buffer.length + bytes.length);
    next.set(this.buffer);
    next.set(bytes, this.buffer.length);
    this.buffer = next;
    if (this.buffer.length > 2 * 1024 * 1024)
      throw Error("Device response exceeds limit.");
    while (this.buffer.length) {
      if (this.file) {
        if (this.buffer.length < this.file.size) return;
        const f = this.file;
        this.file = null;
        const data = this.buffer.slice(0, f.size);
        this.buffer = this.buffer.slice(f.size);
        this.emit({ type: "file", path: f.path, bytes: data });
        continue;
      }
      const end = this.buffer.indexOf(10);
      if (end < 0) return;
      const line = new TextDecoder()
        .decode(this.buffer.slice(0, end))
        .replace(/\r$/, "");
      this.buffer = this.buffer.slice(end + 1);
      const failure = /^(?:CONFIG|FILE|COMMAND)_ERROR:(.*)$/.exec(line);
      if (!this.json && failure) {
        this.emit({ type: "error", message: failure[1].trim() });
        continue;
      }
      if (line.startsWith("SYNC_JSON:")) {
        this.jsonType = "json";
        this.json = line.slice(10);
      } else if (line.startsWith("SYNC_ICONS:")) {
        this.jsonType = "icons";
        this.json = line.slice(11);
      } else if (line.startsWith("ICON_DELETED:")) {
        this.jsonType = "deleted";
        this.json = line.slice(13);
      } else if (line.startsWith("SYNC_CAPS:")) {
        this.jsonType = "caps";
        this.json = line.slice(10);
      } else if (line.startsWith("SYNC_UPLOAD:")) {
        this.jsonType = "upload";
        this.json = line.slice(12);
      } else if (line.startsWith("SYNC_RENDER:")) {
        this.jsonType = "render";
        this.json = line.slice(12);
      } else if (this.json) this.json += "\n" + line;
      if (this.json) {
        if (this.json.length > 1024 * 1024)
          throw Error("Configuration response exceeds limit.");
        try {
          const value: unknown = JSON.parse(this.json);
          this.json = "";
          this.emit({ type: this.jsonType, value });
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
        continue;
      }
      const match = /^SYNC_FILE:(.+):(\d+)$/.exec(line);
      if (match) {
        const size = Number(match[2]);
        if (size > 1024 * 1024) throw Error("Icon response exceeds limit.");
        if (size === 0)
          this.emit({ type: "file", path: match[1], bytes: new Uint8Array() });
        else this.file = { path: match[1], size };
      } else if (line === "FILE_OK") this.emit({ type: "ok" });
    }
  }
}
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: {
    dataTerminalReady: boolean;
    requestToSend: boolean;
  }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
export interface SerialAPI {
  requestPort(): Promise<SerialPortLike>;
}
export function serialAPI(): SerialAPI | undefined {
  return (navigator as Navigator & { serial?: SerialAPI }).serial;
}
export class Device {
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reading?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private pending?: {
    accept: (event: SerialEvent) => boolean;
    resolve: (event: SerialEvent) => void;
    reject: (error: Error) => void;
  };
  private closed = false;
  private visualsSupported = false;
  constructor(
    private port: SerialPortLike,
    private onLost: (error: Error) => void = () => {},
  ) {}
  async open() {
    await this.port.open({ baudRate: 115200 });
    try {
      await this.port.setSignals?.({
        dataTerminalReady: false,
        requestToSend: false,
      });
    } catch {
      /* Bridges may not expose signals. */
    }
    if (!this.port.readable || !this.port.writable)
      throw Error("Device streams unavailable.");
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.reading = this.read();
  }
  private async read() {
    const parser = new SerialParser((e) => {
      if (e.type === "error") {
        this.pending?.reject(
          Error(e.message || "Device rejected the command."),
        );
        return;
      }
      if (this.pending?.accept(e)) {
        const p = this.pending;
        this.pending = undefined;
        p.resolve(e);
      }
    });
    try {
      while (!this.closed) {
        const r = await this.reader!.read();
        if (r.done) break;
        if (r.value) parser.push(r.value);
      }
      if (!this.closed) throw Error("Device disconnected.");
    } catch (e) {
      if (!this.closed) {
        const error = e instanceof Error ? e : Error(String(e));
        this.pending?.reject(error);
        this.pending = undefined;
        this.closed = true;
        this.onLost(error);
      }
    } finally {
      this.reader?.releaseLock();
    }
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  private async exchange(
    command: string | string[] | null,
    accept: (e: SerialEvent) => boolean,
    payload?: Uint8Array,
    timeout = 10000,
  ): Promise<SerialEvent> {
    if (this.closed || !this.writer) throw Error("Connect the device first.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        reject(Error("Device response timed out. Reconnect before retrying."));
      }, timeout);
      const fail = (e: Error) => {
        clearTimeout(timer);
        this.pending = undefined;
        reject(e);
      };
      this.pending = {
        accept,
        resolve: (e) => {
          clearTimeout(timer);
          resolve(e);
        },
        reject: fail,
      };
      void (async () => {
        if (command !== null) {
          const commands = Array.isArray(command) ? command : [command];
          for (const line of commands) {
            if (!this.pending) return;
            await this.writer!.write(new TextEncoder().encode(line + "\n"));
          }
        }
        if (payload && this.pending) await this.writer!.write(payload);
      })().catch(fail);
    });
  }
  getConfig(): Promise<unknown> {
    return this.enqueue(async () => {
      const e = await this.exchange("GET_JSON", (e) => e.type === "json");
      if (e.type !== "json") throw Error("Invalid response.");
      return e.value;
    });
  }
  getFile(path: string): Promise<Uint8Array> {
    return this.enqueue(async () => {
      if (!safePath(path)) throw Error("Invalid icon path.");
      const e = await this.exchange(
        "GET_FILE:" + path,
        (e) => e.type === "file" && e.path === path,
        undefined,
        path.startsWith("/backgrounds/") ? 120000 : 10000,
      );
      if (e.type !== "file") throw Error("Invalid file response.");
      return e.bytes;
    });
  }
  upload(path: string, bytes: Uint8Array) {
    return this.enqueue(async () => {
      if (!safePath(path)) throw Error("Invalid icon path.");
      await this.exchange(
        `FILE:${path}:${bytes.length}`,
        (e) => e.type === "ok",
        bytes,
      );
    });
  }
  ensurePageSupport(pages: number) {
    return this.enqueue(async () => {
      try {
        const e = await this.exchange(
          "GET_CAPABILITIES",
          (e) => e.type === "caps",
          undefined,
          2500,
        );
        const max =
          e.type === "caps" && e.value && typeof e.value === "object"
            ? (e.value as Record<string, unknown>).max_pages
            : undefined;
        if (typeof max !== "number" || max < pages) throw Error("unsupported");
      } catch {
        throw Error(
          "Update the device firmware before applying multiple pages.",
        );
      }
    });
  }
  ensureVisualSupport() {
    return this.enqueue(async () => {
      try {
        const e = await this.exchange(
          "GET_CAPABILITIES",
          (e) => e.type === "caps",
          undefined,
          2500,
        );
        if (
          e.type !== "caps" ||
          !e.value ||
          typeof e.value !== "object" ||
          (e.value as Record<string, unknown>).cached_backgrounds !== true ||
          (e.value as Record<string, unknown>).upload_v2 !== true
        )
          throw Error("unsupported");
        this.visualsSupported = true;
      } catch {
        throw Error(
          "Update the device firmware before applying wallpaper, transparency or blur settings.",
        );
      }
    });
  }
  uploadPrepared(path: string, bytes: Uint8Array) {
    return this.enqueue(async () => {
      if (
        !/^\/backgrounds\/[A-Za-z0-9_.-]+\.jpg$/.test(path) ||
        !safePath(path) ||
        bytes.length > 512 * 1024
      )
        throw Error("Invalid prepared background.");
      const accepts = (e: SerialEvent) =>
        e.type === "upload" &&
        !!e.value &&
        typeof e.value === "object" &&
        (e.value as Record<string, unknown>).path === path;
      const start = await this.exchange(
        `FILE_BEGIN:${path}:${bytes.length}`,
        accepts,
      );
      const ready =
        start.type === "upload" ? (start.value as Record<string, unknown>) : {};
      if (ready.state !== "ready")
        throw Error(String(ready.error || "Device refused asset upload."));
      const end = await this.exchange(null, accepts, bytes, 120000);
      const done =
        end.type === "upload" ? (end.value as Record<string, unknown>) : {};
      if (done.state !== "done" || done.bytes !== bytes.length)
        throw Error(String(done.error || "Asset upload was not confirmed."));
    });
  }
  save(config: Config) {
    return this.enqueue(async () => {
      // Listen before writing: a rejected save can reply before write() settles.
      const event = await this.exchange(
        ["JSON:" + JSON.stringify(config), "GET_JSON"],
        (e) => e.type === "json",
        undefined,
        15000,
      );
      if (event.type !== "json" || canonical(event.value) !== canonical(config))
        throw Error(
          "Device readback differs from draft. Changes may be partially saved.",
        );
      if (this.visualsSupported) {
        const status = await this.exchange(
          "GET_RENDER_STATUS",
          (e) => e.type === "render",
        );
        if (
          status.type !== "render" ||
          !status.value ||
          typeof status.value !== "object" ||
          (status.value as Record<string, unknown>).ok !== true
        )
          throw Error(
            "Configuration saved but device rendering fell back: " +
              String(
                (status.type === "render"
                  ? (status.value as Record<string, unknown>)
                  : {}
                )?.error || "unknown render error",
              ),
          );
      }
    });
  }
  listIcons() {
    return this.enqueue(async () => {
      let event: SerialEvent;
      try {
        event = await this.exchange(
          "LIST_ICONS",
          (e) => e.type === "icons",
          undefined,
          2500,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("timed out"))
          throw new IconLibraryUnavailable();
        throw error;
      }
      if (event.type !== "icons") throw Error("Invalid icon library response.");
      return parseIconList(event.value);
    });
  }
  deleteIcon(path: string) {
    return this.enqueue(async () => {
      if (!isManagedIcon(path))
        throw Error("Only PNG files inside /icons can be deleted.");
      const event = await this.exchange(
        "DELETE_ICON:" + path,
        (e) =>
          e.type === "deleted" &&
          !!e.value &&
          typeof e.value === "object" &&
          (e.value as Record<string, unknown>).path === path,
      );
      if (
        event.type !== "deleted" ||
        !event.value ||
        typeof event.value !== "object"
      )
        throw Error("Invalid deletion acknowledgement.");
      const reply = event.value as Record<string, unknown>;
      if (reply.ok !== true)
        throw Error(
          typeof reply.error === "string"
            ? reply.error
            : "Device did not confirm deletion. Refresh the library before retrying.",
        );
    });
  }
  async close() {
    this.closed = true;
    this.pending?.reject(Error("Connection cancelled."));
    this.pending = undefined;
    try {
      await this.reader?.cancel();
    } catch {
      /* Already disconnected. */
    }
    await this.reading;
    try {
      this.writer?.releaseLock();
    } finally {
      await this.port.close();
    }
  }
}
export async function applyConfig(
  device: Device,
  config: Config,
  icons: Record<string, Blob>,
  progress: (message: string) => void,
) {
  let uploaded = 0;
  try {
    if (!appearanceReady(config.theme))
      throw Error(
        "Choose a wallpaper and wait for its blur preview to finish.",
      );
    if (config.tiles.length > 8)
      await device.ensurePageSupport(config.tiles.length / 8);
    const used = referencedAssets(config);
    const prepared = Object.keys(icons).some(
      (path) => used.has(path) && path.startsWith("/backgrounds/"),
    );
    if (prepared || hasVisualSettings(config.theme))
      await device.ensureVisualSupport();
    for (const [path, blob] of Object.entries(icons)) {
      if (!used.has(path)) continue;
      progress(
        path.startsWith("/backgrounds/")
          ? "Uploading prepared background (large images may take a minute)…"
          : "Uploading icon…",
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (path.startsWith("/backgrounds/")) {
        const existing = await device.getFile(path);
        if (
          existing.length === bytes.length &&
          bytes.every((b, i) => existing[i] === b)
        ) {
          uploaded++;
          continue;
        }
        await device.uploadPrepared(path, bytes);
      } else await device.upload(path, bytes);
      progress(
        path.startsWith("/backgrounds/")
          ? "Verifying background bytes from device…"
          : "Verifying icon bytes…",
      );
      const readback = await device.getFile(path);
      if (
        readback.length !== bytes.length ||
        !bytes.every((b, i) => readback[i] === b)
      )
        throw Error("Icon verification failed.");
      uploaded++;
    }
    progress("Saving configuration and verifying…");
    await device.save(config);
  } catch (e) {
    throw Error(
      `${e instanceof Error ? e.message : String(e)} ${uploaded} asset(s) verified; the device may contain partial changes. Your draft is retained.`,
    );
  }
}
