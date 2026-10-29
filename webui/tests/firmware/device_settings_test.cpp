#include "Arduino.h"
#include "Preferences.h"
#include "device_settings.h"
#include <cassert>
#include <iostream>
FakeSerial Serial;
namespace backlight {
unsigned frequency() { return 600; }
} // namespace backlight
static unsigned applied_brightness = 100, starts = 0, releases = 0;
static bool pwm = true;
bool display_set_brightness(unsigned value) {
    if (!pwm)
        return false;
    applied_brightness = value;
    return true;
}
bool display_brightness_available() { return pwm; }
void ble_init() { ++starts; }
void ble_release_keys() { ++releases; }
bool ble_connected() { return true; }
int main() {
    device_settings_init();
    assert(device_brightness() == 100 && starts == 1 && prefs.writes == 0);
    assert(device_set_brightness(35, false));
    assert(applied_brightness == 35 && prefs.writes == 0);
    assert(device_set_brightness(35, true));
    assert(prefs.writes == 1 && prefs.values["brightness"] == 35);
    assert(device_set_brightness(35, true) && prefs.writes == 1);
    device_settings_init();
    assert(device_brightness() == 35);
    assert(device_set_brightness(0, false) && applied_brightness == 10);
    assert(device_set_brightness(255, false) && applied_brightness == 100);
    prefs.fail_write = true;
    assert(!device_set_brightness(40, true) && device_brightness() == 40);
    assert(std::string(device_settings_error()).find("could not be saved") != std::string::npos);
    pwm = false;
    assert(!device_set_brightness(70, false) && device_brightness() == 40);
    assert(std::string(device_settings_error()).find("unavailable") != std::string::npos);
    device_restart();
    assert(releases == 1 && ESP.restarts == 1);
    prefs = {};
    prefs.available = false;
    pwm = true;
    device_settings_init();
    assert(device_brightness() == 100 && !device_set_brightness(50, true));
    std::cout << "Device settings tests passed: persisted brightness, bounds, release-only writes, "
                 "PWM/NVS failure and ESP32 restart.\n";
}
