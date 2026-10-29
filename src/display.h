#pragma once
#include <lvgl.h>

void display_init(bool init_touch = true);
void display_loop();

// Display lifecycle implemented in display.cpp.
void display_start();
void display_refresh_sync();
void display_print_status();

bool display_set_brightness(unsigned percent);
bool display_brightness_available();
