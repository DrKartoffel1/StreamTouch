#pragma once
#include <lvgl.h>

void display_init(bool init_touch = true);
void display_loop();

// Display lifecycle implemented in display.cpp.
void display_start();
void display_refresh_sync();
void display_print_status();
// 400x240 RGB565 thumbnails; rendering one never publishes it to the LCD.
void display_copy_thumbnail(uint16_t *pixels);
void display_render_thumbnail(uint16_t *pixels);
void display_begin_navigation();
uint16_t *display_navigation_buffer();
void display_present_navigation();
void display_end_navigation();

bool display_set_brightness(unsigned percent);
bool display_brightness_available();
