import { describe, it, expect, vi } from "vitest";
import {
  SerialParser,
  Device,
  applyConfig,
  type SerialEvent,
  type SerialPortLike,
} from "../src/serial";
import { freshConfig } from "../src/config";
const enc = new TextEncoder();
function mockPort(
  handler: (bytes: Uint8Array, send: (bytes: Uint8Array) => void) => void,
) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const port: SerialPortLike = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setSignals: vi.fn(async () => {}),
    readable: new ReadableStream({
      start(c) {
        controller = c;
      },
    }),
    writable: new WritableStream({
      write(bytes) {
        handler(bytes, (b) => controller.enqueue(b));
      },
    }),
  };
  return { port, drop: () => controller.close() };
}
describe("serial parser", () => {
  it("parses fragmented multiline JSON, logs, binary newlines and following packets", () => {
    const events: SerialEvent[] = [];
    const parser = new SerialParser((e) => events.push(e));
    const raw = enc.encode(
      'boot log\r\nSYNC_JSON:{\n"tiles": []\n}\r\nSYNC_FILE:/icons/a.png:4\nA\n\u0000BFILE_OK\r\nSYNC_FILE:/missing.png:0\n',
    );
    for (const byte of raw) parser.push(Uint8Array.of(byte));
    expect(events).toEqual([
      { type: "json", value: { tiles: [] } },
      {
        type: "file",
        path: "/icons/a.png",
        bytes: Uint8Array.of(65, 10, 0, 66),
      },
      { type: "ok" },
      { type: "file", path: "/missing.png", bytes: new Uint8Array() },
    ]);
  });
  it("rejects oversized binary responses", () => {
    expect(() =>
      new SerialParser(() => {}).push(enc.encode("SYNC_FILE:/x:99999999\n")),
    ).toThrow("exceeds limit");
  });
});
describe("device lifecycle", () => {
  it("serializes commands and releases stream locks on close", async () => {
    const seen: string[] = [];
    const { port } = mockPort((b, send) => {
      const cmd = new TextDecoder().decode(b);
      seen.push(cmd);
      queueMicrotask(() =>
        send(
          enc.encode(
            cmd === "GET_JSON\n" ? "SYNC_JSON:{}\n" : "SYNC_FILE:/missing:0\n",
          ),
        ),
      );
    });
    const d = new Device(port);
    await d.open();
    const responses = await Promise.all([d.getConfig(), d.getFile("/missing")]);
    expect(responses[0]).toEqual({});
    expect(responses[1]).toHaveLength(0);
    expect(seen).toEqual(["GET_JSON\n", "GET_FILE:/missing\n"]);
    await d.close();
    expect(port.readable?.locked).toBe(false);
    expect(port.writable?.locked).toBe(false);
    expect(port.close).toHaveBeenCalled();
  });
  it("rejects pending and queued work after disconnection", async () => {
    const lost = vi.fn();
    const { port, drop } = mockPort(() => {});
    const d = new Device(port, lost);
    await d.open();
    const pending = d.getConfig();
    const queued = d.getFile("/missing");
    const results = Promise.allSettled([pending, queued]);
    await new Promise((r) => setTimeout(r, 0));
    drop();
    expect((await results).every((r) => r.status === "rejected")).toBe(true);
    expect(lost).toHaveBeenCalledOnce();
    await d.close();
    expect(port.writable?.locked).toBe(false);
  });
  it("cancels pending requests without reporting accidental unplug", async () => {
    const lost = vi.fn();
    const { port } = mockPort(() => {});
    const d = new Device(port, lost);
    await d.open();
    const result = d.getConfig().catch((e) => e.message);
    await new Promise((r) => setTimeout(r, 0));
    await d.close();
    expect(await result).toBe("Connection cancelled.");
    expect(lost).not.toHaveBeenCalled();
  });
  it("times out absent responses", async () => {
    vi.useFakeTimers();
    try {
      const { port } = mockPort(() => {});
      const d = new Device(port);
      await d.open();
      const result = d.getConfig().catch((e) => e.message);
      await vi.advanceTimersByTimeAsync(10001);
      expect(await result).toContain("timed out");
      await d.close();
    } finally {
      vi.useRealTimers();
    }
  });
  it("writes compact JSON then confirms raw readback", async () => {
    let saved: unknown;
    const { port } = mockPort((b, send) => {
      const s = new TextDecoder().decode(b);
      if (s.startsWith("JSON:")) saved = JSON.parse(s.slice(5));
      if (s === "GET_JSON\n")
        send(enc.encode("SYNC_JSON:" + JSON.stringify(saved) + "\n"));
    });
    const d = new Device(port);
    await d.open();
    await d.save(freshConfig());
    await d.close();
  });
  it.each(["CONFIG_ERROR", "COMMAND_ERROR"])(
    "reports %s received during configuration write without false success",
    async (prefix) => {
      const config = freshConfig();
      const { port } = mockPort((bytes, send) => {
        const command = new TextDecoder().decode(bytes);
        if (command.startsWith("JSON:"))
          send(enc.encode(prefix + ":SD write refused\n"));
        if (command === "GET_JSON\n")
          send(enc.encode("SYNC_JSON:" + JSON.stringify(config) + "\n"));
      });
      const device = new Device(port);
      await device.open();
      await expect(device.save(config)).rejects.toThrow("SD write refused");
      await device.close();
      expect(port.writable?.locked).toBe(false);
    },
  );
  it("reports legacy file failure immediately", async () => {
    const { port } = mockPort((bytes, send) => {
      if (new TextDecoder().decode(bytes).startsWith("FILE:"))
        send(enc.encode("FILE_ERROR:Cannot create staged file\n"));
    });
    const device = new Device(port);
    await device.open();
    await expect(
      device.upload("/icons/test.png", new Uint8Array([1])),
    ).rejects.toThrow("Cannot create staged file");
    await device.close();
  });
  it("rejects mismatching configuration readback", async () => {
    const { port } = mockPort((b, send) => {
      if (new TextDecoder().decode(b) === "GET_JSON\n")
        send(enc.encode("SYNC_JSON:{}\n"));
    });
    const d = new Device(port);
    await d.open();
    await expect(d.save(freshConfig())).rejects.toThrow("readback differs");
    await d.close();
  });
  it("uploads binary data and awaits FILE_OK before the next command", async () => {
    let payload = false;
    const seen: string[] = [];
    const { port } = mockPort((b, send) => {
      if (payload) {
        expect(Array.from(b)).toEqual([0, 10, 255]);
        payload = false;
        send(enc.encode("FILE_OK\n"));
      } else {
        const cmd = new TextDecoder().decode(b);
        seen.push(cmd);
        if (cmd.startsWith("FILE:")) payload = true;
        else send(enc.encode("SYNC_JSON:{}\n"));
      }
    });
    const d = new Device(port);
    await d.open();
    await Promise.all([
      d.upload("/icons/test.png", Uint8Array.of(0, 10, 255)),
      d.getConfig(),
    ]);
    expect(seen).toEqual(["FILE:/icons/test.png:3\n", "GET_JSON\n"]);
    await d.close();
  });
});
describe("explicit Apply", () => {
  it("checks icon bytes before saving and skips unreferenced files", async () => {
    const c = freshConfig();
    c.tiles[0].icon = "/icons/new.png";
    const calls: string[] = [];
    const mock = {
      upload: vi.fn(async () => {
        calls.push("upload");
      }),
      getFile: vi.fn(async () => {
        calls.push("read");
        return enc.encode("png");
      }),
      save: vi.fn(async () => {
        calls.push("save");
      }),
    };
    await applyConfig(
      mock as unknown as Device,
      c,
      {
        "/icons/new.png": new Blob(["png"]),
        "/icons/unused.png": new Blob(["unused"]),
      },
      () => {},
    );
    expect(calls).toEqual(["upload", "read", "save"]);
  });
  it("reports partial changes and does not save after verification failure", async () => {
    const c = freshConfig();
    c.tiles[0].icon = "/icons/new.png";
    const mock = {
      upload: vi.fn(async () => {}),
      getFile: vi.fn(async () => new Uint8Array()),
      save: vi.fn(),
    };
    await expect(
      applyConfig(
        mock as unknown as Device,
        c,
        { "/icons/new.png": new Blob(["png"]) },
        () => {},
      ),
    ).rejects.toThrow("draft is retained");
    expect(mock.save).not.toHaveBeenCalled();
  });
});

describe("device icon library", () => {
  it("parses fragmented library and deletion messages", () => {
    const events: SerialEvent[] = [];
    const parser = new SerialParser((e) => events.push(e));
    const payload = enc.encode(
      'SYNC_ICONS:{"version":1,"files":[]}\nICON_DELETED:{"path":"/icons/a.png","ok":true}\n',
    );
    for (const byte of payload) parser.push(Uint8Array.of(byte));
    expect(events).toEqual([
      { type: "icons", value: { version: 1, files: [] } },
      { type: "deleted", value: { path: "/icons/a.png", ok: true } },
    ]);
  });
  it("lists files and only resolves a deletion after explicit acknowledgement", async () => {
    const { port } = mockPort((b, send) => {
      const cmd = new TextDecoder().decode(b);
      if (cmd === "LIST_ICONS\n")
        send(
          enc.encode(
            'SYNC_ICONS:{"version":1,"files":[{"path":"/icons/a.png","size":64,"in_use":false}]}\n',
          ),
        );
      else send(enc.encode('ICON_DELETED:{"path":"/icons/a.png","ok":true}\n'));
    });
    const d = new Device(port);
    await d.open();
    expect(await d.listIcons()).toEqual([
      { path: "/icons/a.png", size: 64, in_use: false },
    ]);
    await d.deleteIcon("/icons/a.png");
    await expect(d.deleteIcon("/macros.json")).rejects.toThrow("Only PNG");
    await d.close();
  });
  it("surfaces firmware refusal without claiming deletion succeeded", async () => {
    const { port } = mockPort((_, send) =>
      send(
        enc.encode(
          'ICON_DELETED:{"path":"/icons/a.png","ok":false,"error":"Icon is referenced"}\n',
        ),
      ),
    );
    const d = new Device(port);
    await d.open();
    await expect(d.deleteIcon("/icons/a.png")).rejects.toThrow("referenced");
    await d.close();
  });
  it("reports unsupported old firmware but keeps editing commands available", async () => {
    vi.useFakeTimers();
    try {
      const { port } = mockPort((b, send) => {
        if (new TextDecoder().decode(b) === "GET_JSON\n")
          send(enc.encode("SYNC_JSON:{}\n"));
      });
      const d = new Device(port);
      await d.open();
      const result = d.listIcons().catch((e) => e.message);
      await vi.advanceTimersByTimeAsync(2501);
      expect(await result).toContain("updated firmware");
      expect(await d.getConfig()).toEqual({});
      await d.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("prepared image transfers", () => {
  it("parses capabilities, upload acknowledgement and render reports", () => {
    const events: SerialEvent[] = [];
    const parser = new SerialParser((e) => events.push(e));
    parser.push(
      enc.encode(
        'SYNC_CAPS:{"cached_backgrounds":true}\nSYNC_UPLOAD:{"path":"/backgrounds/a.jpg","state":"ready"}\nSYNC_RENDER:{"ok":true}\n',
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["caps", "upload", "render"]);
  });
  it("waits for ready, sends unmodified binary without an extra newline and confirms bytes", async () => {
    let receiving = false;
    const { port } = mockPort((bytes, send) => {
      if (!receiving) {
        expect(new TextDecoder().decode(bytes)).toBe(
          "FILE_BEGIN:/backgrounds/a.jpg:3\n",
        );
        receiving = true;
        send(
          enc.encode(
            'SYNC_UPLOAD:{"path":"/backgrounds/a.jpg","state":"ready"}\n',
          ),
        );
      } else {
        expect(Array.from(bytes)).toEqual([255, 216, 255]);
        send(
          enc.encode(
            'SYNC_UPLOAD:{"path":"/backgrounds/a.jpg","state":"done","bytes":3}\n',
          ),
        );
      }
    });
    const d = new Device(port);
    await d.open();
    await d.uploadPrepared("/backgrounds/a.jpg", Uint8Array.of(255, 216, 255));
    await d.close();
  });
  it("never sends binary after a refused upload", async () => {
    let writes = 0;
    const { port } = mockPort((_, send) => {
      writes++;
      send(
        enc.encode(
          'SYNC_UPLOAD:{"path":"/backgrounds/a.jpg","state":"error","error":"SD unavailable"}\n',
        ),
      );
    });
    const d = new Device(port);
    await d.open();
    await expect(
      d.uploadPrepared("/backgrounds/a.jpg", Uint8Array.of(255, 216, 255)),
    ).rejects.toThrow("SD unavailable");
    expect(writes).toBe(1);
    await d.close();
  });
  it("verifies actual render success after a visual save", async () => {
    let saved: unknown;
    const { port } = mockPort((bytes, send) => {
      const cmd = new TextDecoder().decode(bytes);
      if (cmd === "GET_CAPABILITIES\n")
        send(
          enc.encode(
            'SYNC_CAPS:{"cached_backgrounds":true,"upload_v2":true}\n',
          ),
        );
      else if (cmd.startsWith("JSON:")) saved = JSON.parse(cmd.slice(5));
      else if (cmd === "GET_JSON\n")
        send(enc.encode("SYNC_JSON:" + JSON.stringify(saved) + "\n"));
      else if (cmd === "GET_RENDER_STATUS\n")
        send(
          enc.encode('SYNC_RENDER:{"ok":false,"error":"Insufficient PSRAM"}\n'),
        );
    });
    const d = new Device(port);
    await d.open();
    await d.ensureVisualSupport();
    await expect(d.save(freshConfig())).rejects.toThrow("Insufficient PSRAM");
    await d.close();
  });
});
