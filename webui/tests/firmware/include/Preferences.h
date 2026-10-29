#pragma once
#include <cstdint>
#include <map>
#include <string>
struct PreferenceState {
    bool available = true, fail_write = false;
    unsigned writes = 0;
    std::map<std::string, uint8_t> values;
};
inline PreferenceState prefs;
class Preferences {
  public:
    bool begin(const char *, bool) { return prefs.available; }
    uint8_t getUChar(const char *key, uint8_t fallback) {
        auto entry = prefs.values.find(key);
        return entry == prefs.values.end() ? fallback : entry->second;
    }
    unsigned putUChar(const char *key, uint8_t value) {
        if (prefs.fail_write) return 0;
        prefs.values[key] = value;
        ++prefs.writes;
        return 1;
    }
};
