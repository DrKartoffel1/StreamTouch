# StreamTouch

A modern, fully themeable ESP32-S3 Macropad with a sleek WebUI.

StreamTouch transforms a 4.3" ESP32-S3 RGB LCD into a powerful Native USB HID Macropad. It features completely dynamic global theming, SD card icon fetching, on-the-fly macro recording, and extended media/application launch codes.

> **Hardware Note:** This project is designed specifically for the **Guition JC8048W550C** board. It has only been tested and is only confirmed to be working with this exact screen.

## WebUI Configuration

You can configure your macros, customize your theme, and upload icons directly from your browser using the Web Serial API! No software installation is required.

👉 **[Configure your StreamTouch here](https://DrKartoffel1.github.io/StreamTouch/)**

*Note: You must use a Chromium-based browser (Chrome, Edge, Opera) for Web Serial support.*

## Flashing the Firmware

This project uses PlatformIO. To flash the firmware to your ESP32-S3:

1. Open the `StreamTouch` folder in VSCode with the PlatformIO extension installed.
2. Plug in your ESP32-S3 via USB.
3. Click the **Upload** button (the right arrow) in the PlatformIO bottom toolbar.

Alternatively, from the command line:
```bash
pio run -t upload
```

*Important: Make sure you click "Disconnect" in the WebUI before flashing, otherwise the Serial port will be busy!*
