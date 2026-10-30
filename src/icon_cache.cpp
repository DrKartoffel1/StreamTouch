#include "icon_cache.h"
#include "pages.h"
#include <cstdlib>
#include <src/draw/lv_draw_image_private.h>
#include <src/draw/sw/lv_draw_sw.h>
#include <src/image/lv_image_decoder_private.h>
#include <src/misc/cache/instance/lv_image_cache.h>
#include <src/misc/lv_area_private.h>

namespace {
lv_image_dsc_t descriptors[MAX_TILES] = {};
uint8_t *pixels[MAX_TILES] = {};
unsigned count = 0, failures = 0;
size_t bytes = 0;
unsigned hits = 0, decodes = 0;
} // namespace

void icon_cache_release() {
    for (int i = 0; i < MAX_TILES; ++i) {
        lv_image_cache_drop(&descriptors[i]);
        free(pixels[i]);
        pixels[i] = nullptr;
        descriptors[i] = {};
    }
    // Old full-resolution PNG entries otherwise fragment PSRAM during rebuilds.
    lv_image_cache_drop(nullptr);
    count = failures = 0;
    bytes = 0;
    hits = decodes = 0;
}

bool icon_cache_attach(lv_obj_t *image, int slot) {
    if (slot < 0 || slot >= int(MAX_TILES) || !pixels[slot])
        return false;
    lv_image_set_src(image, &descriptors[slot]);
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CENTER);
    ++hits;
    return true;
}
unsigned icon_cache_hits() { return hits; }
unsigned icon_cache_decodes() { return decodes; }
bool icon_cache_prepare(lv_obj_t *image, int slot) {
    if (slot < 0 || slot >= int(MAX_TILES))
        return false;
    if (icon_cache_attach(image, slot))
        return true;
    lv_image_decoder_dsc_t decoder = {};
    lv_image_decoder_args_t args = {};
    args.no_cache = true;
    if (lv_image_decoder_open(&decoder, lv_image_get_src(image), &args) != LV_RESULT_OK) {
        ++failures;
        return false;
    }
    if (!decoder.decoded) {
        lv_image_decoder_close(&decoder);
        ++failures;
        return false;
    }
    ++decodes;
    auto format = static_cast<lv_color_format_t>(decoder.decoded->header.cf);
    if (format != LV_COLOR_FORMAT_ARGB8888 && format != LV_COLOR_FORMAT_ARGB8888_PREMULTIPLIED) {
        lv_image_decoder_close(&decoder);
        ++failures;
        return false;
    }
    int scale = lv_image_get_scale(image);
    int w = lv_obj_get_width(image), h = lv_obj_get_height(image);
    // Only fixed-size device foregrounds are cached, never full-resolution source images.
    if (w <= 0 || h <= 0 || w > 163 || h > 195) {
        lv_image_decoder_close(&decoder);
        ++failures;
        return false;
    }
    // Icons are fully theme-recolored. Keep coverage only, avoiding an RGB
    // recolor pass and four-byte source reads on every button redraw.
    size_t size = size_t(w) * h;
    uint8_t *buffer = static_cast<uint8_t *>(calloc(1, size));
    if (!buffer) {
        lv_image_decoder_close(&decoder);
        ++failures;
        return false;
    }
    // Use LVGL's own sampler without compositing onto a transparent canvas;
    // an extra blend would round semi-transparent alpha a second time.
    lv_draw_image_dsc_t draw;
    lv_draw_image_dsc_init(&draw);
    draw.scale_x = draw.scale_y = scale;
    draw.pivot = {0, 0};
    int x = (w - int(decoder.header.w) * scale / LV_SCALE_NONE) / 2;
    int y = (h - int(decoder.header.h) * scale / LV_SCALE_NONE) / 2;
    lv_area_t box = {-x, -y, w - x - 1, h - y - 1}, bounds, clipped;
    lv_image_buf_get_transformed_area(&bounds, decoder.header.w, decoder.header.h, 0, scale, scale,
                                      &draw.pivot);
    // The sampler clamps past the source's bottom/right edge. The normal image
    // renderer clips first; do the same so transparent margins never extrude it.
    if (lv_area_intersect(&clipped, &box, &bounds)) {
        lv_color32_t row[163];
        for (int cy = clipped.y1; cy <= clipped.y2; ++cy) {
            lv_area_t area = {clipped.x1, cy, clipped.x2, cy};
            lv_draw_sw_transform(&area, decoder.decoded->data, decoder.header.w, decoder.header.h,
                                 decoder.decoded->header.stride, &draw, nullptr, format, row);
            for (int cx = clipped.x1; cx <= clipped.x2; ++cx)
                buffer[(cy + y) * w + cx + x] = row[cx - clipped.x1].alpha;
        }
    }
    lv_image_decoder_close(&decoder);

    auto &dsc = descriptors[slot];
    dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
    dsc.header.cf = LV_COLOR_FORMAT_A8;
    dsc.header.w = w;
    dsc.header.h = h;
    dsc.header.stride = w;
    dsc.data_size = size;
    dsc.data = pixels[slot] = buffer;
    lv_image_set_src(image, &dsc);
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CENTER);
    ++count;
    bytes += size;
    return true;
}
unsigned icon_cache_count() { return count; }
unsigned icon_cache_failures() { return failures; }
size_t icon_cache_bytes() { return bytes; }
