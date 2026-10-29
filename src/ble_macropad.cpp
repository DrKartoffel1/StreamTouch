#include "ble_macropad.h"
#include <BleKeyboard.h>

BleKeyboard bleKeyboard("StreamTouch", "GSD", 100);

static bool keys_pressed = false;
static uint32_t press_time = 0;
static bool media_pending = false;

bool ble_connected() { return bleKeyboard.isConnected(); }
void ble_release_keys() {
    // Clear the library report even after disconnect, so reconnect cannot replay held keys.
    bleKeyboard.releaseAll();
    if (bleKeyboard.isConnected()) {
        MediaKeyReport zero = {0, 0};
        bleKeyboard.sendReport(&zero);
    }
    keys_pressed = media_pending = false;
}

void ble_init() { bleKeyboard.begin(); }

void ble_loop() {
    if (keys_pressed && (millis() - press_time >= 50)) {
        bleKeyboard.releaseAll();

        // Ensure a complete zero-report is sent for media keys (Consumer Control)
        // This explicitly fixes Linux/CachyOS missing the key-up event.
        if (media_pending) {
            MediaKeyReport zero_report = {0, 0};
            bleKeyboard.sendReport(&zero_report);
        }

        keys_pressed = false;
        media_pending = false;
    }
}

void ble_send_keys(const std::vector<uint16_t> &keys, const std::vector<uint16_t> &media_keys) {
    if (!bleKeyboard.isConnected())
        return;

    for (uint16_t k : keys) {
        bleKeyboard.press(k);
    }

    if (!media_keys.empty()) {
        MediaKeyReport report = {0, 0};
        for (uint16_t mk : media_keys) {
            report[0] |= mk & 0xFF;
            report[1] |= (mk >> 8) & 0xFF;
        }
        bleKeyboard.sendReport(&report);
    }

    media_pending = !media_keys.empty();
    press_time = millis();
    keys_pressed = true;
}
