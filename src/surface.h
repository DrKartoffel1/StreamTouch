#pragma once
#include <Arduino.h>
#include <lvgl.h>

struct SurfaceConfig {
    bool image = false;
    String background;
    String blurred;
    uint8_t opacity = 160;
    uint8_t blur = 0;
};
extern SurfaceConfig g_surface;
void surface_release();
void surface_prepare();
const lv_image_dsc_t *surface_background();
const lv_image_dsc_t *surface_button(int slot, bool pressed);
bool surface_ok();
const char *surface_error();
size_t surface_bytes();
