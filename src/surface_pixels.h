#pragma once
#include <stdint.h>

// LVGL's bundled TJPGD emits B,G,R bytes. The panel uses the same BGR channel
// mapping as config.cpp's theme colors, so blue occupies the high five bits.
inline uint16_t surface_pixel_from_jpeg_bgr(const uint8_t *pixel) {
    return ((pixel[0] & 0xf8) << 8) | ((pixel[1] & 0xfc) << 3) | (pixel[2] >> 3);
}
