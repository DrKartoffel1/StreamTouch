import { useEffect, useState } from "react";
import type { Theme } from "../config";
import {
  blurRadius,
  blurMatches,
  blurredPath,
  opacity,
  prepareWallpaper,
  prepareBlur,
} from "../background";
import { Button } from "./ui/button";
export function BackgroundControls({
  theme,
  assets,
  disabled,
  onChange,
  onStage,
  onProcessing,
  onRead,
  connected,
}: {
  theme: Theme;
  assets: Record<string, Blob>;
  disabled: boolean;
  onChange: (patch: Partial<Theme>) => void;
  onStage: (path: string, blob: Blob, patch: Partial<Theme>) => void;
  onProcessing: (value: boolean) => void;
  onRead: (path: string) => Promise<Blob>;
  connected: boolean;
}) {
  const [error, setError] = useState("");
  const radius = blurRadius(theme),
    path = theme.background_image || "",
    source = assets[path];
  const cachedPath =
    theme.background_blur_image &&
    blurMatches(path, radius, theme.background_blur_image) &&
    assets[theme.background_blur_image]
      ? theme.background_blur_image
      : Object.keys(assets).find((candidate) =>
          blurMatches(path, radius, candidate),
        );
  const cached = cachedPath ? assets[cachedPath] : undefined;
  useEffect(() => {
    if (!connected || theme.background_mode !== "image" || !path || source)
      return;
    let cancelled = false;
    void onRead(path).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [connected, theme.background_mode, path, source, onRead]);
  useEffect(() => {
    if (
      theme.background_mode !== "image" ||
      !radius ||
      !source ||
      (blurMatches(path, radius, theme.background_blur_image) &&
        cachedPath === theme.background_blur_image)
    )
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      onProcessing(true);
      void (async () => {
        try {
          const blob = cached || (await prepareBlur(source, radius));
          if (!cancelled) {
            const destination =
              cachedPath ||
              blurredPath(path, radius).replace(
                /\.jpg$/,
                `-${crypto.randomUUID()}.jpg`,
              );
            onStage(destination, blob, { background_blur_image: destination });
          }
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) onProcessing(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      onProcessing(false);
    };
  }, [
    theme.background_mode,
    theme.background_blur_image,
    radius,
    source,
    path,
    cachedPath,
    cached,
    onStage,
    onProcessing,
    onRead,
    connected,
  ]);
  async function choose(file?: File) {
    if (!file) return;
    setError("");
    onProcessing(true);
    try {
      const asset = await prepareWallpaper(file, theme.background);
      onStage(asset.path, asset.blob, {
        background_mode: "image",
        background_image: asset.path,
        background_blur_image: undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      onProcessing(false);
    }
  }
  return (
    <section
      className="background-controls"
      aria-label="Wallpaper and button glass"
    >
      <h3>Wallpaper</h3>
      <label className="field">
        Background mode
        <select
          aria-label="Background mode"
          disabled={disabled}
          value={theme.background_mode || "color"}
          onChange={(e) =>
            onChange({ background_mode: e.target.value as "color" | "image" })
          }
        >
          <option value="color">Solid color</option>
          <option value="image">Background image</option>
        </select>
      </label>
      {theme.background_mode === "image" && (
        <>
          <label className="field">
            Choose background image
            <input
              aria-label="Choose background image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="help">
            Center crop to 800 × 480, preserving aspect ratio. Up to 25 MiB / 32
            megapixels. Prepared locally; uploaded only on Apply.
          </p>
          {path && <p className="icon-path">{path}</p>}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ background_mode: "color" })}
          >
            Use solid color
          </Button>
        </>
      )}
      <h3>Button glass</h3>
      <label className="field">
        Transparency{" "}
        <output>{Math.round((1 - opacity(theme) / 255) * 100)}%</output>
        <input
          aria-label="Button transparency"
          type="range"
          min="0"
          max="100"
          value={Math.round((1 - opacity(theme) / 255) * 100)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              button_opacity: Math.round(
                255 * (1 - Number(e.target.value) / 100),
              ),
            })
          }
        />
      </label>
      <label className="field">
        Blur <output>{radius} px</output>
        <input
          aria-label="Button blur"
          type="range"
          min="0"
          max="24"
          value={radius}
          disabled={disabled}
          onChange={(e) => onChange({ button_blur: Number(e.target.value) })}
        />
      </label>
      <p className="help">
        Only the button backdrop changes. Icons and text stay sharp and fully
        opaque. Blur is visible with an image background; it is cached when
        settings change.
      </p>
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
    </section>
  );
}
