#include "navigation.h"
#include "navigation_pixels.h"
#include "display.h"
#include "pages.h"
#include <Arduino.h>
#include <lvgl.h>
#include <cstdlib>

namespace {
constexpr int Width = 400, Height = 240;
struct Frame {
    int scene = -1;
    unsigned used = 0;
    uint16_t *pixels = nullptr;
};
// Three scene thumbnails, at most 576,000 bytes.
// Composite directly into the display's existing hidden framebuffer.
Frame frames[3];
unsigned cache_clock = 0, rendered = 0;
uint32_t maximum_frame_us = 0;
lv_obj_t *overlay = nullptr;
Frame *outgoing = nullptr, *incoming = nullptr;
int dx = 0, dy = 0, last_progress = -1;
void (*completion)() = nullptr;

bool allocate(Frame &frame) {
    if (!frame.pixels)
        frame.pixels = static_cast<uint16_t *>(malloc(Width * Height * sizeof(uint16_t)));
    return frame.pixels != nullptr;
}
Frame *find(int scene) {
    for (auto &frame : frames)
        if (frame.scene == scene)
            return &frame;
    return nullptr;
}
Frame *acquire(int scene, int pinned = -1) {
    Frame *result = find(scene);
    if (!result) {
        for (auto &frame : frames) {
            if (pinned >= 0 && frame.scene == pinned)
                continue;
            if (!result || frame.scene < 0 || frame.used < result->used)
                result = &frame;
            if (frame.scene < 0)
                break;
        }
        if (!result || !allocate(*result))
            return nullptr;
        result->scene = scene;
    }
    result->used = ++cache_clock;
    return result;
}
void release(Frame &frame) {
    free(frame.pixels);
    frame = {};
}
void destroy_overlay() {
    if (overlay) {
        lv_anim_delete(overlay, nullptr);
        lv_obj_delete(overlay);
        overlay = nullptr;
    }
}
void position(int progress) {
    if (last_progress == progress || progress == 0)
        return;
    last_progress = progress;
    uint32_t started = micros();
    navigation_compose(outgoing->pixels, incoming->pixels, display_navigation_buffer(), Width,
                       Height, progress, dx, dy, progress < 1024 ? 2 : 1);
    if (progress > 0) {
        display_present_navigation();
        navigation_record_frame(micros() - started);
    }
}
} // namespace

void navigation_capture(int scene) {
    if (find(scene) && scene != int(MAX_PAGES)) {
        acquire(scene);
        return;
    }
    if (auto *frame = acquire(scene)) {
        display_copy_thumbnail(frame->pixels);
    }
}
bool navigation_start(int from, int to, int horizontal, int vertical, void (*completed)()) {
    auto *source = find(from);
    if (!source)
        return false;
    auto *target = find(to);
    bool needs_render = !target || to == int(MAX_PAGES); // Settings status/brightness are dynamic.
    target = acquire(to, from);
    if (!target)
        return false;
    if (needs_render) {
        display_render_thumbnail(target->pixels);
    }
    dx = horizontal;
    dy = vertical;
    completion = completed;
    outgoing = source;
    incoming = target;
    last_progress = -1;
    overlay = lv_obj_create(lv_screen_active());
    lv_obj_set_pos(overlay, 0, 0);
    lv_obj_set_clickable(overlay, false);
    lv_obj_set_hidden(overlay, true);
    display_begin_navigation();
    position(0);
    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation, overlay);
    lv_anim_set_values(&animation, 0, 1024);
    lv_anim_set_duration(&animation, 320);
    lv_anim_set_path_cb(&animation, lv_anim_path_ease_in_out);
    lv_anim_set_exec_cb(&animation, [](void *, int32_t progress) { position(progress); });
    lv_anim_set_completed_cb(&animation, [](lv_anim_t *) {
        auto callback = completion;
        completion = nullptr;
        destroy_overlay();
        display_end_navigation();
        if (callback)
            callback();
    });
    lv_anim_start(&animation);
    return true;
}
void navigation_reset() {
    completion = nullptr;
    if (overlay)
        display_end_navigation();
    destroy_overlay();
    for (auto &frame : frames)
        release(frame);
    cache_clock = rendered = maximum_frame_us = 0;
}
bool navigation_active() { return overlay != nullptr; }
// Retained for existing GET_DISPLAY_STATUS clients.
bool navigation_blur() { return false; }
size_t navigation_bytes() {
    size_t size = 0;
    for (auto &frame : frames)
        if (frame.pixels) {
            size += Width * Height * sizeof(uint16_t);
        }
    return size;
}
void navigation_record_frame(uint32_t render_us) {
    ++rendered;
    if (render_us > maximum_frame_us)
        maximum_frame_us = render_us;
}
unsigned navigation_frames() { return rendered; }
uint32_t navigation_max_frame_us() { return maximum_frame_us; }
