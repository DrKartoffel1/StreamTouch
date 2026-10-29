#include "surface.h"
#include "file_store.h"
#include "surface_pixels.h"
#include "config.h"
#include <SD.h>
#include <esp_heap_caps.h>
#include <src/libs/tjpgd/tjpgd.h>
#include <src/misc/cache/instance/lv_image_cache.h>

SurfaceConfig g_surface;
namespace {
constexpr int W = 800, H = 480;
uint16_t *background = nullptr;
uint16_t *patches[8][2] = {};
lv_image_dsc_t bg_descriptor = {}, patch_descriptor[8][2] = {};
String error;
size_t allocated = 0;
struct Decode {
    File file;
    uint16_t *pixels;
};
size_t input(JDEC *jd, uint8_t *buffer, size_t count) {
    Decode *ctx = static_cast<Decode *>(jd->device);
    if (buffer)
        return ctx->file.read(buffer, count);
    size_t before = ctx->file.position();
    ctx->file.seek(before + count);
    return ctx->file.position() - before;
}
int output(JDEC *jd, void *bitmap, JRECT *rect) {
    Decode *ctx = static_cast<Decode *>(jd->device);
    auto src = static_cast<const uint8_t *>(bitmap);
    if (rect->right >= W || rect->bottom >= H)
        return 0;
    for (int y = rect->top; y <= rect->bottom; ++y)
        for (int x = rect->left; x <= rect->right; ++x) {
            ctx->pixels[y * W + x] = surface_pixel_from_jpeg_bgr(src);
            src += 3;
        }
    if (rect->left == 0)
        delay(0);
    return 1;
}
uint16_t *decode(const String &path) {
    if (!path.startsWith("/backgrounds/") || !path.endsWith(".jpg") || path.indexOf("..") >= 0) {
        error = "Invalid background path";
        return nullptr;
    }
    recover_stored_file(path);
    Decode ctx = {SD.open(path.c_str(), FILE_READ), nullptr};
    if (!ctx.file || ctx.file.size() > 512 * 1024) {
        error = "Background image missing or exceeds 512 KiB";
        return nullptr;
    }
    uint8_t *workspace = static_cast<uint8_t *>(malloc(4096));
    if (!workspace) {
        error = "Insufficient memory for JPEG workspace";
        return nullptr;
    }
    JDEC jd;
    if (jd_prepare(&jd, input, workspace, 4096, &ctx) != JDR_OK || jd.width != W ||
        jd.height != H) {
        free(workspace);
        error = "Background must be a prepared 800x480 baseline JPEG";
        return nullptr;
    }
    ctx.pixels =
        static_cast<uint16_t *>(heap_caps_malloc(W * H * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!ctx.pixels) {
        free(workspace);
        error = "Insufficient PSRAM for background";
        return nullptr;
    }
    JRESULT result = jd_decomp(&jd, output, 0);
    ctx.file.close();
    free(workspace);
    if (result != JDR_OK) {
        free(ctx.pixels);
        error = "Background JPEG decoding failed";
        return nullptr;
    }
    return ctx.pixels;
}
void descriptor(lv_image_dsc_t &dsc, uint16_t *pixels, int w, int h) {
    dsc = {};
    dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
    dsc.header.cf = LV_COLOR_FORMAT_RGB565;
    dsc.header.w = w;
    dsc.header.h = h;
    dsc.header.stride = w * 2;
    dsc.data_size = w * h * 2;
    dsc.data = reinterpret_cast<const uint8_t *>(pixels);
}
uint16_t tint(uint16_t pixel, uint32_t color, uint8_t alpha) {
    int r = ((pixel >> 11) & 31) * 255 / 31;
    int g = ((pixel >> 5) & 63) * 255 / 63;
    int b = (pixel & 31) * 255 / 31;
    r = (r * (255 - alpha) + ((color >> 16) & 255) * alpha + 127) / 255;
    g = (g * (255 - alpha) + ((color >> 8) & 255) * alpha + 127) / 255;
    b = (b * (255 - alpha) + (color & 255) * alpha + 127) / 255;
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}
} // namespace
void surface_release() {
    // Called after old screen objects have been deleted, before reusing descriptors.
    lv_image_cache_drop(&bg_descriptor);
    free(background);
    background = nullptr;
    for (int i = 0; i < 8; ++i)
        for (int p = 0; p < 2; ++p) {
            lv_image_cache_drop(&patch_descriptor[i][p]);
            free(patches[i][p]);
            patches[i][p] = nullptr;
        }
    allocated = 0;
    error = "";
}
void surface_prepare() {
    surface_release();
    if (!g_surface.image)
        return;
    background = decode(g_surface.background);
    if (!background)
        return;
    allocated = W * H * 2;
    descriptor(bg_descriptor, background, W, H);
    if (!g_surface.blur || g_surface.opacity == 255)
        return;
    uint16_t *blurred = decode(g_surface.blurred);
    if (!blurred)
        return;
    const int widths[4] = {163, 162, 163, 162};
    const int xs[4] = {30, 223, 415, 608};
    bool success = true;
    for (int slot = 0; slot < 8 && success; ++slot) {
        int width = widths[slot % 4], top = 30 + (slot / 4) * 225;
        for (int p = 0; p < 2; ++p) {
            uint16_t *pixels = static_cast<uint16_t *>(
                heap_caps_malloc(width * 195 * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
            if (!pixels) {
                error = "Insufficient PSRAM for cached button glass";
                success = false;
                break;
            }
            patches[slot][p] = pixels;
            allocated += width * 195 * 2;
            for (int y = 0; y < 195; ++y)
                for (int x = 0; x < width; ++x)
                    pixels[y * width + x] =
                        tint(blurred[(top + y) * W + xs[slot % 4] + x],
                             p ? g_theme.animation : g_theme.button, g_surface.opacity);
            descriptor(patch_descriptor[slot][p], pixels, width, 195);
            delay(0);
        }
    }
    free(blurred);
    if (!success) {
        for (int i = 0; i < 8; ++i)
            for (int p = 0; p < 2; ++p) {
                free(patches[i][p]);
                patches[i][p] = nullptr;
            }
        allocated = W * H * 2;
    }
}
const lv_image_dsc_t *surface_background() { return background ? &bg_descriptor : nullptr; }
const lv_image_dsc_t *surface_button(int slot, bool pressed) {
    return patches[slot][pressed ? 1 : 0] ? &patch_descriptor[slot][pressed ? 1 : 0] : nullptr;
}
bool surface_ok() { return error.length() == 0; }
const char *surface_error() { return error.c_str(); }
size_t surface_bytes() { return allocated; }
