#pragma once
#include <Arduino.h>
#include <vector>

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
    String label;
    String icon_path;
    std::vector<uint16_t> keys;
    std::vector<uint16_t> media_keys;
};

extern ButtonConfig g_buttons[8];
extern ThemeConfig g_theme;

bool config_init();
bool config_load();
