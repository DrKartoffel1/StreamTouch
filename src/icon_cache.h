#pragma once
#include <lvgl.h>

// Release only after deleting the old UI objects that reference these descriptors.
void icon_cache_release();
bool icon_cache_prepare(lv_obj_t *image, int slot);
unsigned icon_cache_count();
unsigned icon_cache_failures();
size_t icon_cache_bytes();
