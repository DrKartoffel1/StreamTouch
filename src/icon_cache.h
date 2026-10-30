#pragma once
#include <lvgl.h>

// Configuration-scoped masks: release only after deleting all referencing UI objects.
void icon_cache_release();
bool icon_cache_attach(lv_obj_t *image, int slot);
unsigned icon_cache_hits();
unsigned icon_cache_decodes();
bool icon_cache_prepare(lv_obj_t *image, int slot);
unsigned icon_cache_count();
unsigned icon_cache_failures();
size_t icon_cache_bytes();
