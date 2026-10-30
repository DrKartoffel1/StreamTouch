import { useEffect, useRef, useState } from "react";
import { blurRadius } from "../background";
import type { Config } from "../config";
import {
  deviceLayout,
  drawLabel,
  labelLayout,
  containIcon,
} from "../device-layout";
function DeviceLabel({ text, color }: { text: string; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = labelLayout(text);
  useEffect(() => {
    if (canvas.current) drawLabel(canvas.current, text, color);
  }, [text, color]);
  return (
    <canvas
      ref={canvas}
      className="tile-label"
      aria-hidden="true"
      style={{ width: Math.max(1, layout.width), height: layout.height }}
    />
  );
}
function DeviceIcon({ blob }: { blob?: Blob }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!blob || !element.current) return;
    const target = element.current;
    const url = URL.createObjectURL(blob);
    let cancelled = false;
    const image = new Image();
    const fit = () => {
      if (cancelled || !image.naturalWidth) return;
      const size = containIcon(
        image.naturalWidth,
        image.naturalHeight,
        target.clientWidth,
        target.clientHeight,
      );
      target.style.maskSize = `${size.width}px ${size.height}px`;
      target.style.webkitMaskSize = `${size.width}px ${size.height}px`;
      target.style.maskImage = `url(${url})`;
      target.style.webkitMaskImage = `url(${url})`;
    };
    const observer = new ResizeObserver(fit);
    image.onload = () => {
      fit();
      observer.observe(target);
    };
    image.src = url;
    return () => {
      cancelled = true;
      observer.disconnect();
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return <span ref={element} aria-hidden="true" className="tile-icon" />;
}
function Wallpaper({
  blob,
  className,
  position,
}: {
  blob?: Blob;
  className: string;
  position?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!blob || !element.current) return;
    const target = element.current;
    const url = URL.createObjectURL(blob);
    target.style.backgroundImage = `url(${url})`;
    return () => {
      target.style.backgroundImage = "";
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <div
      ref={element}
      aria-hidden="true"
      className={className}
      style={{ backgroundPosition: position }}
    />
  );
}
export function DevicePreview({
  config,
  icons,
  selected,
  pressed,
  disabled,
  onSelect,
}: {
  config: Config;
  icons: Record<string, Blob>;
  selected: number;
  pressed: boolean;
  disabled: boolean;
  onSelect: (slot: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setScale(entries[0].contentRect.width / deviceLayout.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="device-shell">
      <div ref={frame} className="device-viewport">
        <div className="device-grid" style={{ transform: `scale(${scale})` }}>
          {config.theme.background_mode === "image" && (
            <Wallpaper
              blob={
                config.theme.background_image
                  ? icons[config.theme.background_image]
                  : undefined
              }
              className="wallpaper"
            />
          )}
          {config.tiles
            .slice(
              Math.floor(selected / 8) * 8,
              Math.floor(selected / 8) * 8 + 8,
            )
            .map((tile, i) => {
              const slot = Math.floor(selected / 8) * 8 + i;
              const down = pressed || active === slot;
              const text = tile.label ?? `Btn ${slot + 1}`;
              return (
                <button
                  type="button"
                  key={i}
                  className={`device-tile ${down ? "is-pressed" : ""} ${config.theme.background_mode === "image" && blurRadius(config.theme) > 0 && config.theme.background_blur_image && icons[config.theme.background_blur_image] ? "has-blur" : ""}`}
                  aria-label={`Slot ${slot + 1}${tile.label ? `: ${tile.label}` : ""}`}
                  aria-pressed={slot === selected}
                  disabled={disabled}
                  onPointerDown={() => setActive(slot)}
                  onPointerUp={() => setActive(null)}
                  onPointerCancel={() => setActive(null)}
                  onPointerLeave={() => setActive(null)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") setActive(slot);
                  }}
                  onKeyUp={() => setActive(null)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelect(slot)}
                >
                  {config.theme.background_mode === "image" &&
                    blurRadius(config.theme) > 0 &&
                    config.theme.background_blur_image &&
                    icons[config.theme.background_blur_image] && (
                      <Wallpaper
                        blob={icons[config.theme.background_blur_image]}
                        className="tile-backdrop"
                        position={`-${30 + deviceLayout.columns.slice(0, i % 4).reduce((a, b) => a + b, 0) + (i % 4) * 30}px -${30 + Math.floor(i / 4) * 225}px`}
                      />
                    )}
                  {tile.icon && <DeviceIcon blob={icons[tile.icon]} />}
                  <DeviceLabel
                    text={text}
                    color={down ? config.theme.text_pressed : config.theme.text}
                  />
                </button>
              );
            })}
        </div>
      </div>
      <div className="device-chin">
        <span className="device-led" />
        STREAMTOUCH / 03<span>800 × 480</span>
      </div>
    </div>
  );
}
