#pragma once
#include <cstddef>
#include <cstdint>

// GT911 status+first-point burst. A cleared data-ready bit is not a release.
struct TouchReport {
    bool pressed = false;
    uint16_t x = 0, y = 0;
    bool update(const uint8_t *packet, size_t length) {
        if (!length || !(packet[0] & 0x80))
            return false;
        unsigned contacts = packet[0] & 0x0f;
        if (contacts > 5)
            return false;
        if (!contacts) {
            pressed = false;
            return true;
        }
        if (length < 9)
            return false;
        uint16_t next_x = packet[2] | uint16_t(packet[3]) << 8;
        uint16_t next_y = packet[4] | uint16_t(packet[5]) << 8;
        if (next_x >= 800 || next_y >= 480)
            return false;
        x = next_x;
        y = next_y;
        pressed = true;
        return true;
    }
};
