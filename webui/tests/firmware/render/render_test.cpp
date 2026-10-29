#include "config.h"
#include "display_frames.h"
#include "icon_cache.h"
#include "lvgl.h"
#include "surface.h"
#include "surface_pixels.h"
#include "touch_report.h"
#include "ui.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <src/libs/tjpgd/tjpgd.h>

ButtonConfig g_buttons[8];
ThemeConfig g_theme = {0xffffff, 0xff0000, 0x0000ff, 0xffffff, 0x00ff00,
                       0xffffff, 0xff0000, 0xffffff, 0xffffff, 0xffffff};
SurfaceConfig g_surface;
static uint16_t framebuffers[2][800 * 480], draw_buffer[800 * 20];
static uint16_t *screen = framebuffers[0];
static DisplayFrames frames;
static uint16_t patch_pixels[2][163 * 195];
static lv_image_dsc_t patch[2];
void surface_prepare() {}
const lv_image_dsc_t *surface_background() { return nullptr; }
const lv_image_dsc_t *surface_button(int slot, bool) { return &patch[slot % 2]; }
bool surface_ok() { return true; }
const char *surface_error() { return ""; }
size_t surface_bytes() { return sizeof(patch_pixels); }
void display_refresh_sync() {}
static unsigned macro_calls = 0, key_releases = 0, brightness_saves = 0, restarts = 0;
static uint8_t brightness = 100;
static bool connected = true;
bool ble_connected() { return connected; }
void ble_release_keys() { ++key_releases; }
bool display_brightness_available() { return true; }
uint8_t device_brightness() { return brightness; }
bool device_set_brightness(uint8_t value, bool persist) {
    brightness = value;
    if (persist)
        ++brightness_saves;
    return true;
}
const char *device_settings_error() { return ""; }
void device_restart() { ++restarts; }
void ble_send_keys(const std::vector<uint16_t> &, const std::vector<uint16_t> &) { ++macro_calls; }

static void require(bool condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "FAIL: %s\n", message);
        exit(1);
    }
}
static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels) {
    size_t stride = lv_draw_buf_width_to_stride(area->x2 - area->x1 + 1, LV_COLOR_FORMAT_RGB565);
    frames.stage(area->x1, area->y1, area->x2, area->y2, pixels, stride);
    if (lv_display_flush_is_last(display)) {
        screen = frames.pending();
        frames.presented();
    }
    lv_display_flush_ready(display);
}
struct JpegInput {
    FILE *file;
    uint16_t pixels[56 * 8] = {};
};
static size_t jpeg_input(JDEC *decoder, uint8_t *bytes, size_t count) {
    auto &input = *static_cast<JpegInput *>(decoder->device);
    if (bytes)
        return fread(bytes, 1, count, input.file);
    return fseek(input.file, count, SEEK_CUR) == 0 ? count : 0;
}
static int jpeg_output(JDEC *decoder, void *bitmap, JRECT *rect) {
    auto &input = *static_cast<JpegInput *>(decoder->device);
    auto *pixel = static_cast<uint8_t *>(bitmap);
    for (int y = rect->top; y <= rect->bottom; ++y)
        for (int x = rect->left; x <= rect->right; ++x, pixel += 3)
            input.pixels[y * 56 + x] = surface_pixel_from_jpeg_bgr(pixel);
    return 1;
}
static void test_colors(const char *fixture) {
    JpegInput input{fopen(fixture, "rb")};
    require(input.file, "open JPEG fixture");
    JDEC decoder;
    uint8_t workspace[4096];
    require(jd_prepare(&decoder, jpeg_input, workspace, sizeof(workspace), &input) == JDR_OK,
            "prepare actual bundled JPEG decoder");
    require(decoder.width == 56 && decoder.height == 8, "JPEG dimensions");
    require(jd_decomp(&decoder, jpeg_output, 0) == JDR_OK, "decode color fixture");
    fclose(input.file);
    // Expected values use the same red/blue mapping as config.cpp, not an assumed RGB decoder.
    const uint32_t theme_colors[] = {0x800000, 0xffff00, 0x0000ff, 0x00ff00,
                                     0x00ffff, 0xffffff, 0x000000};
    for (int i = 0; i < 7; ++i) {
        uint16_t expected = lv_color_to_u16(lv_color_hex(theme_colors[i]));
        uint16_t actual = input.pixels[4 * 56 + i * 8 + 4];
        require(abs(int(actual >> 11) - int(expected >> 11)) <= 1 &&
                    abs(int((actual >> 5) & 63) - int((expected >> 5) & 63)) <= 1 &&
                    abs(int(actual & 31) - int(expected & 31)) <= 1,
                "JPEG navy/cyan/primary colors match panel theme mapping");
    }
    puts("PASS: actual JPEG decoder preserves panel navy/cyan/primary colors");
}
static bool red(uint16_t pixel) {
    return (pixel >> 11) > 24 && ((pixel >> 5) & 63) < 16 && (pixel & 31) < 8;
}
static void test_pressed_corners(lv_display_t *display) {
    for (int i = 0; i < 2; ++i) {
        int width = i ? 162 : 163;
        for (auto &pixel : patch_pixels[i])
            pixel = 0xf800;
        auto &dsc = patch[i];
        dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
        dsc.header.cf = LV_COLOR_FORMAT_RGB565;
        dsc.header.w = width;
        dsc.header.h = 195;
        dsc.header.stride = width * 2;
        dsc.data_size = width * 195 * 2;
        dsc.data = reinterpret_cast<const uint8_t *>(patch_pixels[i]);
    }
    for (auto &button : g_buttons)
        button.label = "Button";
    ui_init();
    auto *container = lv_obj_get_child(lv_screen_active(), 0);
    lv_obj_update_layout(lv_screen_active());
    lv_refr_now(display);
    auto *first = lv_obj_get_child(container, 0);
    require(lv_obj_get_style_transition(first, LV_PART_MAIN) == nullptr,
            "release has no delayed animation work");
    for (int tap = 0; tap < 20; ++tap) {
        lv_obj_add_state(first, LV_STATE_PRESSED);
        lv_obj_send_event(first, LV_EVENT_PRESSED, nullptr);
        require(lv_obj_get_style_transform_width(first, LV_PART_MAIN) == 0 &&
                    lv_obj_get_style_transform_height(first, LV_PART_MAIN) == 0,
                "default-theme delayed growth does not alter the pressed size");
        lv_anim_refr_now();
        require(lv_obj_get_style_transition(first, LV_PART_MAIN) == nullptr &&
                    lv_obj_get_style_transform_scale_x(first, LV_PART_MAIN) == 256 &&
                    lv_obj_get_style_shadow_width(first, LV_PART_MAIN) == 30,
                "press keeps native size and applies glow immediately across rapid taps");
        lv_obj_remove_state(first, LV_STATE_PRESSED);
        lv_obj_send_event(first, LV_EVENT_RELEASED, nullptr);
        require(lv_obj_get_style_shadow_width(first, LV_PART_MAIN) == 0,
                "release clears the glow without waiting for an old transition");
        lv_tick_inc(12);
        lv_timer_handler();
    }
    int checks = 0;
    for (int state = 0; state < 2; ++state) {
        for (int scale : {240, 244, 252, 256, 260}) {
            for (int i = 0; i < 8; ++i) {
                auto *button = lv_obj_get_child(container, i);
                if (state)
                    lv_obj_add_state(button, LV_STATE_PRESSED);
                else
                    lv_obj_remove_state(button, LV_STATE_PRESSED);
                lv_obj_set_style_transform_scale_x(button, scale, 0);
                lv_obj_set_style_transform_scale_y(button, scale, 0);
                lv_obj_set_style_transform_scale_x(button, scale, LV_STATE_PRESSED);
                lv_obj_set_style_transform_scale_y(button, scale, LV_STATE_PRESSED);
            }
            // Finish inherited theme transitions before sampling the requested animation scale.
            lv_tick_inc(1000);
            lv_timer_handler();
            lv_refr_now(display);
            for (int i = 0; i < 8; ++i) {
                lv_area_t area;
                auto *button = lv_obj_get_child(container, i);
                require(lv_obj_get_style_transform_scale_x(button, LV_PART_MAIN) == scale,
                        "render requested animation scale");
                lv_obj_get_coords(button, &area);
                float cx = area.x1 + lv_area_get_width(&area) / 2;
                float cy = area.y1 + lv_area_get_height(&area) / 2;
                require(red(screen[int(cy + 45) * 800 + int(cx)]), "cached button center is drawn");
                for (int right : {0, 1})
                    for (int bottom : {0, 1}) {
                        // Three pixels inside each square corner, well outside its rounded arc.
                        float x = right ? area.x2 - 3 : area.x1 + 3;
                        float y = bottom ? area.y2 - 3 : area.y1 + 3;
                        int sx = lround(cx + (x - cx) * scale / 256.f);
                        int sy = lround(cy + (y - cy) * scale / 256.f);
                        require(!red(screen[sy * 800 + sx]),
                                "cached glass must not fill square corners");
                        ++checks;
                    }
            }
        }
    }
    printf("PASS: %d rounded-corner pixel checks across eight buttons, normal/pressed and "
           "animation scales\n",
           checks);
}
static TouchReport simulated_touch;
static void simulated_read(lv_indev_t *, lv_indev_data_t *data) {
    data->state = simulated_touch.pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    data->point = {simulated_touch.x, simulated_touch.y};
}
static void test_rapid_input(lv_display_t *display) {
    lv_obj_clean(lv_screen_active());
    ui_init();
    lv_refr_now(display);
    auto *input = lv_indev_create();
    lv_indev_set_type(input, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(input, simulated_read);
    lv_timer_pause(lv_indev_get_read_timer(input));
    uint8_t press[] = {0x81, 0, 100, 0, 100, 0, 0, 0, 0}, stale[] = {0}, release[] = {0x80};
    unsigned initial = macro_calls;
    for (unsigned tap = 0; tap < 20; ++tap) {
        simulated_touch.update(press, sizeof(press));
        lv_indev_read(input);
        lv_anim_refr_now();
        require(macro_calls == initial + tap, "touch-down does not trigger release/click macros");
        for (int i = 0; i < 5; ++i) {
            simulated_touch.update(stale, sizeof(stale));
            lv_indev_read(input);
        }
        require(macro_calls == initial + tap, "stale sensor polls do not fabricate clicks");
        simulated_touch.update(release, sizeof(release));
        lv_indev_read(input);
        require(macro_calls == initial + tap + 1, "each rapid tap sends exactly one click macro");
        lv_tick_inc(5);
    }
    lv_indev_delete(input);
    puts("PASS: 20 rapid LVGL pointer taps preserve release-only macros without phantom clicks");
}
static void test_hold_and_settings(lv_display_t *display) {
    lv_obj_clean(lv_screen_active());
    g_buttons[0].repeat = true;
    ui_init();
    lv_refr_now(display);
    std::vector<uint16_t> original(screen, screen + 800 * 480);
    auto *main = lv_obj_get_child(lv_screen_active(), 0);
    auto *button = lv_obj_get_child(main, 0);
    unsigned before = macro_calls;
    lv_obj_send_event(button, LV_EVENT_PRESSED, nullptr);
    lv_tick_inc(449);
    ui_loop();
    require(macro_calls == before, "hold delay must not trigger early");
    lv_tick_inc(1);
    ui_loop();
    require(macro_calls == before + 1, "hold starts after450ms");
    lv_tick_inc(150);
    ui_loop();
    require(macro_calls == before + 2, "hold repeats at150ms");
    lv_tick_inc(5000);
    ui_loop();
    require(macro_calls == before + 3, "slow frame must not burst missed repeats");
    lv_obj_send_event(button, LV_EVENT_RELEASED, nullptr);
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_tick_inc(1000);
    ui_loop();
    require(macro_calls == before + 3, "release stops repeats without extra click");
    lv_obj_send_event(button, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(button, LV_EVENT_RELEASED, nullptr);
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    require(macro_calls == before + 4, "repeat-enabled short tap still sends one action");
    lv_obj_send_event(button, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(button, LV_EVENT_PRESS_LOST, nullptr);
    lv_tick_inc(1000);
    ui_loop();
    require(macro_calls == before + 4, "sliding away cancels repeat");
    lv_obj_send_event(button, LV_EVENT_PRESSED, nullptr);
    connected = false;
    ui_loop();
    connected = true;
    lv_tick_inc(1000);
    ui_loop();
    require(macro_calls == before + 4, "reconnect must not resume an old hold");
    lv_obj_send_event(button, LV_EVENT_RELEASED, nullptr);
    g_buttons[0].repeat = false;

    require(ui_filter_touch(true, 100, 10), "top margin captures gesture start");
    require(ui_filter_touch(true, 110, 120), "edge gesture stays captured over macro buttons");
    require(ui_filter_touch(false, 110, 120), "gesture release stays captured");
    ui_loop();
    lv_refr_now(display);
    require(lv_obj_is_hidden(main), "swipe opens settings");
    auto *settings = lv_obj_get_child(lv_screen_active(), 1);
    require(!lv_obj_is_hidden(settings), "settings page visible");
    if (const char *path = std::getenv("STREAMTOUCH_SETTINGS_PPM")) {
        FILE *file = fopen(path, "wb");
        require(file, "open settings screenshot");
        fprintf(file, "P6\n800 480\n255\n");
        for (unsigned i = 0; i < 800 * 480; ++i) {
            uint16_t pixel = screen[i];
            uint8_t rgb[] = {uint8_t((pixel >> 11) * 255 / 31),
                             uint8_t(((pixel >> 5) & 63) * 255 / 63),
                             uint8_t((pixel & 31) * 255 / 31)};
            fwrite(rgb, 1, 3, file);
        }
        fclose(file);
    }
    auto *slider = lv_obj_get_child(settings, 4);
    lv_slider_set_value(slider, 35, LV_ANIM_OFF);
    lv_obj_send_event(slider, LV_EVENT_VALUE_CHANGED, nullptr);
    require(brightness == 35 && brightness_saves == 0, "drag updates without NVS writes");
    lv_obj_send_event(slider, LV_EVENT_RELEASED, nullptr);
    require(brightness_saves == 1, "brightness persists on release");
    auto *restart = lv_obj_get_child(settings, 6);
    lv_obj_send_event(restart, LV_EVENT_CLICKED, nullptr);
    require(restarts == 0, "restart requires confirmation");
    lv_tick_inc(4000);
    ui_loop();
    lv_obj_send_event(restart, LV_EVENT_CLICKED, nullptr);
    require(restarts == 0, "expired restart confirmation must not restart");
    lv_obj_send_event(restart, LV_EVENT_CLICKED, nullptr);
    require(restarts == 1, "confirmed restart targets the ESP32 adapter");
    ui_filter_touch(true, 200, 470);
    ui_filter_touch(true, 200, 340);
    ui_filter_touch(false, 200, 340);
    ui_loop();
    lv_refr_now(display);
    require(!lv_obj_is_hidden(main), "upward edge swipe returns");
    require(macro_calls == before + 4, "settings/gestures never send macros");
    require(std::equal(original.begin(), original.end(), screen),
            "return restores exact main screen");
    puts("PASS: hold timing/cancellation, edge isolation, brightness persistence, restart and "
         "pixel-identical return");
}
static void test_icon_cache(lv_display_t *display, const char *fixture, int box_width = 127,
                            int box_height = 120) {
    lv_obj_clean(lv_screen_active());
    icon_cache_release();
    FILE *file = fopen(fixture, "rb");
    require(file, "open PNG fixture");
    fseek(file, 0, SEEK_END);
    std::vector<uint8_t> encoded(ftell(file));
    rewind(file);
    require(fread(encoded.data(), 1, encoded.size(), file) == encoded.size(), "read PNG fixture");
    fclose(file);
    lv_image_dsc_t original = {};
    original.header.magic = LV_IMAGE_HEADER_MAGIC;
    original.header.cf = LV_COLOR_FORMAT_RAW_ALPHA;
    auto dimension = [&](int offset) {
        return uint32_t(encoded[offset]) << 24 | uint32_t(encoded[offset + 1]) << 16 |
               uint32_t(encoded[offset + 2]) << 8 | encoded[offset + 3];
    };
    original.header.w = dimension(16);
    original.header.h = dimension(20);
    original.data_size = encoded.size();
    original.data = encoded.data();
    auto *image = lv_image_create(lv_screen_active());
    lv_obj_set_pos(image, 100, 100);
    lv_obj_set_size(image, box_width, box_height);
    lv_image_set_src(image, &original);
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CONTAIN_DOWNSCALE);
    lv_obj_set_style_image_recolor(image, lv_color_white(), 0);
    lv_obj_set_style_image_recolor_opa(image, LV_OPA_COVER, 0);
    lv_obj_update_layout(image);
    lv_refr_now(display);
    std::vector<uint16_t> baseline(screen, screen + 800 * 480);
    require(icon_cache_prepare(image, 0), "prepare screen-sized PNG cache");
    lv_obj_update_layout(image);
    require(lv_obj_get_width(image) == box_width && lv_obj_get_height(image) == box_height,
            "icon cache preserves foreground box geometry");
    lv_refr_now(display);
    int maximum = 0;
    for (int i = 0; i < 800 * 480; ++i) {
        maximum = std::max(maximum, std::abs(int(baseline[i] >> 11) - int(screen[i] >> 11)));
        maximum =
            std::max(maximum, std::abs(int((baseline[i] >> 5) & 63) - int((screen[i] >> 5) & 63)));
        maximum = std::max(maximum, std::abs(int(baseline[i] & 31) - int(screen[i] & 31)));
    }
    auto *cached = static_cast<const lv_image_dsc_t *>(lv_image_get_src(image));
    require(cached->header.cf == LV_COLOR_FORMAT_A8,
            "theme-colored icons retain only alpha coverage");
    if (box_height == 171) {
        for (int y = box_height - 10; y < box_height; ++y)
            for (int x = 0; x < box_width; ++x)
                require(cached->data[y * cached->header.stride + x] == 0,
                        "bottom margin stays transparent for edge-touching artwork");
    }
    require(maximum <= 2, "cached mask matches native alpha edges within RGB565 blend rounding");
    for (int slot = 1; slot < 8; ++slot) {
        image = lv_image_create(lv_screen_active());
        lv_obj_set_size(image, box_width, box_height);
        lv_image_set_src(image, &original);
        lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CONTAIN_DOWNSCALE);
        lv_obj_update_layout(image);
        require(icon_cache_prepare(image, slot), "prepare every slot from a 512px source");
    }
    require(icon_cache_count() == 8 && icon_cache_failures() == 0 &&
                icon_cache_bytes() <= 8 * box_width * box_height,
            "eight icons stay bounded to foreground sizes instead of full source pixels");
    lv_obj_clean(lv_screen_active());
    icon_cache_release();
    require(icon_cache_count() == 0 && icon_cache_bytes() == 0, "icon buffers release on rebuild");
    image = lv_image_create(lv_screen_active());
    lv_image_set_src(image, "S:/missing.png");
    require(!icon_cache_prepare(image, 0) && icon_cache_failures() == 1,
            "missing icons report preparation failure");
    lv_obj_clean(lv_screen_active());
    icon_cache_release();
    puts("PASS: 512px PNG cache, native appearance, geometry, eight slots, release and missing "
         "file");
}
int main(int argc, char **argv) {
    require(argc >= 3, "JPEG and PNG fixture arguments");
    lv_init();
    test_colors(argv[1]);
    frames.begin(framebuffers[0], framebuffers[1]);
    auto *display = lv_display_create(800, 480);
    lv_display_set_buffers(display, draw_buffer, nullptr, sizeof(draw_buffer),
                           LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    test_pressed_corners(display);
    test_rapid_input(display);
    test_hold_and_settings(display);
    test_icon_cache(display, argv[2]);
    for (int i = 3; i < argc; ++i)
        test_icon_cache(display, argv[i], 127, 171);
    lv_deinit();
}
