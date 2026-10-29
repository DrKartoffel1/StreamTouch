import { safePath, type Config } from "./config";
export interface StoredIcon {
  path: string;
  size: number;
  in_use: boolean;
}
export function normalizeIconPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/^S:/i, "").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return "/" + parts.join("/").toLowerCase();
}
export function isManagedIcon(path: string) {
  return (
    safePath(path) &&
    path.startsWith("/icons/") &&
    /\.png$/i.test(path) &&
    !path
      .slice(1)
      .split("/")
      .some((part) => !part || part === ".")
  );
}
export function iconReferenced(path: string, config: Config) {
  return config.tiles.some(
    (t) => t.icon && normalizeIconPath(t.icon) === normalizeIconPath(path),
  );
}
export function parseIconList(value: unknown): StoredIcon[] {
  if (!value || typeof value !== "object")
    throw Error("Invalid icon library response.");
  const reply = value as Record<string, unknown>;
  if (typeof reply.error === "string") throw Error(reply.error);
  if (
    reply.version !== 1 ||
    !Array.isArray(reply.files) ||
    reply.files.length > 1024
  )
    throw Error("Unsupported icon library response.");
  return reply.files
    .map((item: unknown) => {
      if (!item || typeof item !== "object") throw Error("Invalid icon entry.");
      const file = item as Record<string, unknown>;
      if (
        typeof file.path !== "string" ||
        !isManagedIcon(file.path) ||
        typeof file.size !== "number" ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.in_use !== "boolean"
      )
        throw Error("Invalid icon entry.");
      return { path: file.path, size: file.size, in_use: file.in_use };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
export class IconLibraryUnavailable extends Error {
  constructor() {
    super(
      "This firmware does not expose the icon library. Install the updated firmware and reconnect. Button and theme editing still work.",
    );
  }
}
