#pragma once
#include <cstdint>
#include <string>
#include <vector>
using MediaKeyReport = uint8_t[2];
struct HidEvent {
    std::string type;
    uint16_t value = 0;
};
struct HidState {
    bool connected = true;
    unsigned begins = 0;
    std::vector<HidEvent> events;
};
inline HidState hid;
class BleKeyboard {
  public:
    BleKeyboard(const char *name, const char *manufacturer, uint8_t battery)
        : name(name), manufacturer(manufacturer), battery(battery) {}
    std::string name, manufacturer;
    uint8_t battery;
    void begin() { ++hid.begins; }
    bool isConnected() { return hid.connected; }
    void press(uint16_t key) { hid.events.push_back({"press", key}); }
    void releaseAll() { hid.events.push_back({"release"}); }
    void sendReport(const MediaKeyReport *report) {
        hid.events.push_back({"media", uint16_t((*report)[0] | uint16_t((*report)[1]) << 8)});
    }
};
