#pragma once
#include <Arduino.h>
#include <vector>
#include "pages.h"

struct ThemeConfig {
    uint32_t icon;
    uint32_t button;
    uint32_t background;
    uint32_t border;
    uint32_t button_press;
    uint32_t text;
    uint32_t animation;
    uint32_t text_pressed;
    uint32_t icon_pressed;
    uint32_t border_pressed;
};

struct ButtonConfig {
    bool repeat = false;
    String label;
    String icon_path;
    std::vector<uint16_t> keys;
    std::vector<uint16_t> media_keys;
};

extern ButtonConfig g_buttons[MAX_TILES];
extern unsigned g_page_count;
extern ThemeConfig g_theme;

bool config_init();
bool config_load();
