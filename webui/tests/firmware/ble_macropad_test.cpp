#include "Arduino.h"
#include "BleKeyboard.h"
#include "ble_macropad.h"
#include <cassert>
#include <iostream>
FakeSerial Serial;
extern BleKeyboard bleKeyboard;
int main() {
    ble_init();
    assert(hid.begins == 1 && bleKeyboard.name == "StreamTouch" &&
           bleKeyboard.manufacturer == "GSD");
    hid.connected = false;
    ble_send_keys({0x80, 'a'}, {});
    assert(hid.events.empty());
    hid.connected = true;
    fake_time = 0;
    ble_send_keys({0x80, 'a'}, {});
    assert(hid.events.size() == 2 && hid.events[0].value == 0x80 && hid.events[1].value == 'a');
    fake_time = 49;
    ble_loop();
    assert(hid.events.size() == 2);
    fake_time = 50;
    ble_loop();
    assert(hid.events.back().type == "release");
    hid.events.clear();
    fake_time = 100;
    ble_send_keys({}, {32, 128, 32768});
    assert(hid.events.size() == 1 && hid.events[0].type == "media" && hid.events[0].value == 32928);
    fake_time = 150;
    ble_loop();
    assert(hid.events.size() == 3 && hid.events[1].type == "release" &&
           hid.events[2].type == "media" && hid.events[2].value == 0);
    hid.events.clear();
    fake_time = 200;
    ble_send_keys({'b'}, {});
    fake_time = 220;
    ble_send_keys({'c'}, {});
    fake_time = 269;
    ble_loop();
    assert(hid.events.size() == 2);
    fake_time = 270;
    ble_loop();
    assert(hid.events.size() == 3 && hid.events.back().type == "release");
    hid.events.clear();
    ble_send_keys({}, {32});
    ble_release_keys();
    assert(hid.events.size() == 3 && hid.events.back().type == "media" &&
           hid.events.back().value == 0);
    auto count = hid.events.size();
    fake_time += 100;
    ble_loop();
    assert(hid.events.size() == count);
    hid.connected = false;
    ble_release_keys();
    assert(hid.events.back().type == "release");
    std::cout << "BLE HID tests passed: identity, disconnected guard, chord order, 50ms release "
                 "and consumer zero report.\n";
}
