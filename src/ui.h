#pragma once
#include <lvgl.h>

void ui_init();
void ui_rebuild();

void ui_loop();
bool ui_filter_touch(bool pressed, int x, int y);
