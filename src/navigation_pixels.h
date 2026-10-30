#pragma once
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>

// Compose at thumbnail resolution, then expand each pixel into a 2x2 block.
// The result is one opaque native-size image: no transformed/alpha LVGL layers.
inline void navigation_compose(const uint16_t *source, const uint16_t *target, uint16_t *output,
                               int width, int height, int progress, int dx, int dy,
                               int sample_step = 1) {
    assert(width > 0 && height > 0 && width % 2 == 0 && height % 2 == 0 && progress >= 0 &&
           progress <= 1024);
    int shift_x = (dx * width * progress / 1024 / sample_step) * sample_step;
    int shift_y = (-dy * height * progress / 1024 / sample_step) * sample_step;
    for (int y = 0; y < height; y += sample_step) {
        auto *row = reinterpret_cast<uint32_t *>(output + y * 2 * width * 2);
        for (int x = 0; x < width; x += sample_step) {
            int sx = x + shift_x, sy = y + shift_y;
            bool incoming = sx < 0 || sx >= width || sy < 0 || sy >= height;
            if (sx < 0)
                sx += width;
            if (sx >= width)
                sx -= width;
            if (sy < 0)
                sy += height;
            if (sy >= height)
                sy -= height;
            uint16_t pixel = (incoming ? target : source)[sy * width + sx];
            uint32_t pair = uint32_t(pixel) | (uint32_t(pixel) << 16);
            for (int i = 0; i < sample_step; ++i)
                row[x + i] = pair;
        }
        for (int i = 1; i < sample_step * 2; ++i)
            std::memcpy(output + (y * 2 + i) * width * 2, row, width * 2 * sizeof(uint16_t));
    }
}
