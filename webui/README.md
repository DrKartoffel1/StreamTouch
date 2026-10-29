# StreamTouch Studio

Static React + TypeScript configurator using Vite, Tailwind CSS and shadcn/ui. Assets are bundled locally; no backend or runtime CDN is required. Firmware lives in `../src`, independently of the browser application.

## Development and verification

Use Node.js 24 or newer and npm. From `StreamTouch3/webui`:

```sh
npm ci
npm run dev
npm run check          # ESLint, unit tests, TypeScript, production build
npm run format:check
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e       # Production build at /StreamTouch/
python3 scripts/test-icon-store.py
python3 scripts/test-render.py
```

Open the URL printed by Vite, including `/StreamTouch/`. For a production preview, run `npm run build` followed by `npm run preview`. Native firmware tests require g++, CMake and installed PlatformIO dependencies. They exercise actual firmware handlers/renderers with test-only hardware adapters. Build firmware from `StreamTouch3` with `pio run -e JC8048W550C`; flashing is a separate action.

## Editing, drafts and Apply

Select a slot to edit its label, shortcut, media/application action or icon. **Record shortcut** captures supported keyboard codes, not timing or sequences; Escape stops recording. Browser/OS reserved shortcuts may not be captured. Additional action entries and unknown configuration fields are retained.

The Theme tab controls all ten colors, built-in/user presets, wallpaper and button glass. Changes update the preview immediately. The workspace derives readable control colors from the theme. The Icons tab browses PNG files stored on the device.

Changes remain in IndexedDB, including staged images, until **Apply to Device**. Draft writes are serialized so an older image conversion cannot overwrite a newer edit. Importing over changes and discarding require confirmation. Connecting retains a changed draft; Apply writes that draft to the device. Discard restores the last loaded/verified configuration. Browser storage can be cleared, so export important configurations.

JSON import/export works without hardware in current Chrome, Edge, Firefox and Safari. Exports retain asset paths but contain no image binaries; keep image originals separately. PNG icons are limited to 32KiB for compatibility with the legacy five-second transfer window. Staged assets receive unique names. Removing an assignment never automatically deletes an SD file.

Direct connection requires Web Serial (normally desktop Chrome/Edge), HTTPS or localhost, and serial-port permission. The device sends shortcuts over **Bluetooth HID**; USB serial is used for configuration. Disconnect the WebUI before flashing. Connection feedback stays **Fetching data from device…** until configuration and referenced assets finish loading.

Apply uploads referenced staged assets, waits for transfer completion, verifies stored bytes, writes JSON and compares configuration readback. Visual settings also require a successful render-status response. Failed Apply preserves the draft and may leave completed uploads/configuration on the device; reconnect and inspect before retrying. Transfers occupy the firmware main loop, so button interaction can pause during Apply. Normal use does not recompute blur.

## Device preview and rendering

The preview scales the complete 800×480 screen. Its geometry matches `src/ui.cpp` and the pinned LVGL 9.6.0 default theme: 30px margins/gaps, alternating 163/162px columns, 195px button height and 24px radii. Feedback changes color, border and glow at a fixed button size. Labels use the actual Montserrat24 bitmap glyphs and kerning, with a 27px line box; long labels clip rather than wrap. Icons retain native size until they must shrink to fit. Selection indicators stay outside the device artwork.

The bitmap asset and LVGL license are bundled in `src/assets/`. After deliberately changing the firmware font, regenerate it with `python3 scripts/extract-device-font.py`. Its recorded SHA-256 must match the installed LVGL source. Panel calibration, RGB565 conversion and browser compositing can affect physical appearance.

Firmware caches clipped icon coverage in A8, preserving sharp recolored foregrounds and transparent margins without decoding PNGs on each press. Whole-button growth/zoom and theme transitions are disabled. A small software shadow cache retains the existing glow. Partial LVGL strips are assembled in a hidden framebuffer and published only when a full refresh is complete; a driver frame-boundary acknowledgement protects buffer reuse. Panel timing and release/click macro activation are retained.

Fresh GT911 data is polled every 5ms before rendering, refreshes are scheduled every 16ms, and the main loop yields 1ms. Stale or invalid touch packets retain the last valid sample. These are scheduling intervals, not guaranteed latency or frame rate. `GET_DISPLAY_STATUS` returns read-only frame/strip counts, refresh/handoff timings, cache health, PSRAM and stack diagnostics.

## Wallpapers and cached glass

Choose solid color or a static background image. **Transparency** (0–100%) and **Blur** (0–24px) affect the button backdrop; labels, icons and borders retain their rendering.

Images receive a centered cover crop without stretching. For the 800×480 screen, a 4000×1000 source scales to 1920×480 before cropping 560px from each side. Smaller sources scale proportionally to fill. PNG/JPEG/WebP input is limited to 25MiB and 32 megapixels; transparency is flattened onto the selected background color. Prepared output is a baseline 800×480 JPEG, at most 512KiB.

A deterministic three-pass box approximation generates a separate blurred JPEG in the browser. The device decodes the prepared assets into RGB565 PSRAM buffers and caches normal/pressed tinted button patches. Fully opaque buttons skip unnecessary glass buffers; solid mode releases wallpaper buffers. This is static-wallpaper blur, with no live blur pass during interaction.

Optional `theme`/preset fields extend the existing ten colors:

- `background_mode`: `color` (default) or `image`.
- `background_image`, `background_blur_image`: prepared `/backgrounds/*.jpg` paths.
- `button_opacity`: 0–255, default 160; displayed as inverse transparency.
- `button_blur`: 0–24, default 0.

Drafts retain prepared bytes, including assets referenced by saved presets. Fresh unique paths avoid overwriting shared assets. Wallpaper garbage collection is outside the Icons tab's scope. The bundled JPEG decoder's BGR output follows the panel's existing channel mapping; existing images require no conversion.

## Stored icon library

Updated firmware supports recursive PNG listing under `/icons`, thumbnails, sizes and saved/draft usage. Refresh reloads the directory. Listings fail visibly beyond 1024 files or eight subdirectory levels. Older firmware retains button/theme editing and shows update guidance for unsupported features.

Deletion is separate from Apply: select an unused icon, confirm **Delete permanently** and await acknowledgement. Saved or draft references protect files. Unassign a used icon and Apply first. Firmware independently checks saved references, aliases and the `/icons/*.png` boundary. If acknowledgement is lost, refresh before retrying.

## Serial protocol and recovery

Serial uses 115200 baud. Existing commands remain compatible:

- `GET_JSON` → `SYNC_JSON:` plus JSON; `JSON:<object>` saves and rebuilds the UI.
- `GET_FILE:<path>` → `SYNC_FILE:<path>:<size>` followed by raw bytes; size 0 means missing.
- `FILE:<path>:<size>` followed by raw bytes → `FILE_OK` only after complete committed transfer; failures return `FILE_ERROR`.
- `LIST_ICONS` → `SYNC_ICONS` JSON; an `error` means the inventory is incomplete.
- `DELETE_ICON:<path>` → `ICON_DELETED` JSON with `ok`/`error`.
- `GET_CAPABILITIES` → `SYNC_CAPS`; confirms prepared-background support.
- `FILE_BEGIN:<path>:<size>` → `SYNC_UPLOAD` ready, then raw bytes → done/byte count or error. Transactions have 120s total / 10s idle bounds and refuse referenced-file overwrites.
- `GET_RENDER_STATUS` → `SYNC_RENDER`; confirms visual decode/allocation succeeded.
- `GET_DISPLAY_STATUS` → `SYNC_DISPLAY` diagnostics.

Text commands are buffered incrementally with a 1MiB configuration limit and a 1s idle timeout; incomplete text no longer blocks touch handling. Binary transfer handlers own their payload reads. The WebUI serializes commands and releases reader/writer locks on disconnect.

Configuration saves validate a complete JSON object and verify staged bytes before replacing `/macros.json`. Configuration and asset commits temporarily retain the previous file as `.previous`, restore it after a failed rename, and recover it on reads when the live path is missing. Incomplete uploads use `.uploading`. These suffixes are reserved for recovery. This protects against detected I/O failures; FAT/SD media cannot guarantee atomic durability during sudden power loss. Do not remove recovery files before inspecting the live file.

## GitHub Pages and acceptance

The React source lives here; `../docs/` is the generated production site for `https://streamtouch.doerries.fyi/`. It replaces the old standalone JavaScript UI. Do not edit generated files directly. Regenerate them after source changes:

```sh
npm run build:pages
```

This builds for `/`, replaces `docs/` with the current bundled app, and copies `public/CNAME` plus `public/.nojekyll`. Commit the source and generated `docs/` changes together. The build deliberately clears old generated assets so obsolete bundles are removed.

GitHub Pages can publish **main → /docs**, or use **GitHub Actions**. Both serve the same modern UI. `../.github/workflows/webui-pages.yml` runs verification, rebuilds `docs/`, rejects stale committed output and deploys that directory. A README-only branch deployment also serves the current editor because the legacy app is gone. Remote settings are not changed by the build.

The workflow sets `PAGES_BASE=/` for verification builds and browser tests. Local development defaults to `/StreamTouch/`; Playwright follows the same `PAGES_BASE` setting as Vite. `build:pages` always uses `/` for the current custom domain. If changing the domain, update `public/CNAME` and rebuild. No pathname routing or server rewrites are needed.

Automated browser coverage includes Chromium, Firefox and WebKit, editing, draft restoration, import/export, keyboard use, narrow layouts, base-path reloads and simulated serial exchanges. WebKit automation is not manual Safari acceptance; manual current Edge/Safari checks remain pending. Native tests cover rendering, touch packets, atomic presentation, BLE output, safe file commits and fragmented/cancelled serial operations. Detailed dated results and real-device verification are retained in workspace `.gsd/STATE.md` and `.gsd/verification/`, rather than duplicated here.

## Hold-repeat and on-device settings

Each Button tab has **Repeat while held**, off by default. It applies to keyboard shortcuts, media keys and application actions. A short tap still sends one action on release. A continuous hold starts after 450ms, then sends one action every 150ms; release or sliding away stops it without an extra release action. A slow frame never queues a burst of missed repeats. Repeats also stop on disconnect, settings navigation or configuration rebuild. Repeating a launch/toggle action repeats that action too, so enable it only where wanted. The optional boolean `tiles[].repeat` survives drafts and JSON import/export; existing configurations retain single-action behavior. Install this firmware before using the new option; older firmware ignores it.

On the device, swipe **down from the top 30px edge** to open Device settings. Swipe **up from the bottom edge**, or tap **Back**, to return. Gestures start outside the macro buttons and remain captured until release. The settings page retains the selected wallpaper/color and theme; the main grid and icon caches remain allocated so returning does not decode images again.

**Screen brightness** controls the existing GPIO2 backlight through 600Hz, 8-bit PWM. The 10–100% range keeps the screen usable; the slider saves to ESP32 NVS on release, independently of the SD JSON/WebUI draft. Brightness restores after restart. Storage/PWM errors are displayed. Espressif documents the underlying [LEDC PWM API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html).

**Device info** shows Bluetooth connection state, screen resolution and free PSRAM. **Restart device** requires a second tap within four seconds and calls the ESP32 restart API; it sends no PC restart command. Bluetooth enabling/disabling was deferred at the user's request; existing Bluetooth HID operation is retained. `GET_DEVICE_STATUS` provides read-only brightness, backlight availability, Bluetooth connection and settings-storage status.

The backlight frequency follows the [board-supplied Arduino SD/blink demo](https://github.com/Shadowtrance/jc8048w550c/blob/main/1-Demo/Demo_Arduino/8_1_lvgl_music_gt911_5.0__sd_with_blink/lvgl_music_gt911_5.0__sd_with_blink/lvgl_music_gt911_5.0__sd_with_blink.ino). The initial 20kHz setting produced an ESP32 waveform but failed to dim the actual backlight and could blank it near 83%. Duty readback alone does not verify optical behavior. `GET_DEVICE_STATUS` includes actual `backlight_hz`; attach/write failures fall back to steady full brightness and report control unavailable.
