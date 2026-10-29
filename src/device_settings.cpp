#include "device_settings.h"
#include "backlight.h"
#include "ble_macropad.h"
#include "display.h"
#include <Arduino.h>
#include <Preferences.h>

namespace {
Preferences preferences;
bool storage = false;
uint8_t brightness = 100;
const char *error = "";
} // namespace
void device_settings_init() {
    storage = preferences.begin("streamtouch", false);
    error = storage ? "" : "Settings storage unavailable; changes are temporary";
    brightness = storage ? constrain(preferences.getUChar("brightness", 100), 10, 100) : 100;
    display_set_brightness(brightness);
    ble_init();
}
uint8_t device_brightness() { return brightness; }
const char *device_settings_error() { return error; }
bool device_set_brightness(uint8_t percent, bool persist) {
    percent = constrain(percent, 10, 100);
    if (!display_set_brightness(percent)) {
        error = "Backlight control unavailable";
        return false;
    }
    brightness = percent;
    if (persist && (!storage || (preferences.getUChar("brightness", 100) != percent &&
                                 preferences.putUChar("brightness", percent) != 1))) {
        error = "Brightness changed but could not be saved";
        return false;
    }
    error = "";
    return true;
}
void device_restart() {
    ble_release_keys();
    ESP.restart();
}
void device_print_status() {
    Serial.printf("SYNC_DEVICE:{\"brightness\":%u,\"backlight_available\":%s,"
                  "\"bluetooth_connected\":%s,\"settings_storage\":%s,\"backlight_hz\":%u}\n",
                  brightness, display_brightness_available() ? "true" : "false",
                  ble_connected() ? "true" : "false", storage ? "true" : "false",
                  backlight::frequency());
}
