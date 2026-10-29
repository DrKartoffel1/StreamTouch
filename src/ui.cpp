#include "ui.h"
#include "ble_macropad.h"
#include "config.h"
#include "device_settings.h"
#include "display.h"
#include "edge_gesture.h"
#include "hold_repeat.h"
#include "icon_cache.h"
#include "surface.h"
#include <Arduino.h>

namespace {
HoldRepeat hold;
EdgeGesture edge;
int held_slot = -1;
bool skip_click[8] = {};
bool settings_open = false;
lv_obj_t *main_panel = nullptr, *settings_panel = nullptr;
lv_obj_t *brightness_text = nullptr, *settings_status = nullptr;
lv_obj_t *restart_text = nullptr;
bool restart_armed = false;
uint32_t restart_time = 0;
void cancel_hold() {
    if (held_slot >= 0) {
        skip_click[held_slot] = true;
        ble_release_keys();
    }
    held_slot = -1;
    hold.cancel();
}
void show_settings(bool open);
} // namespace

static void btn_event_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    int idx = (int)(intptr_t)lv_event_get_user_data(e);
    lv_obj_t *btn = (lv_obj_t *)lv_event_get_target(e);

    if (code == LV_EVENT_CLICKED) {
        if (!skip_click[idx])
            ble_send_keys(g_buttons[idx].keys, g_buttons[idx].media_keys);
    } else if (code == LV_EVENT_PRESSED) {
        cancel_hold();
        skip_click[idx] = false;
        held_slot = idx;
        hold.press(lv_tick_get(), g_buttons[idx].repeat && ble_connected());
        if (lv_obj_get_child_count(btn) > 1) {
            lv_obj_t *img = lv_obj_get_child(btn, 0);
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon_pressed), 0);
        }
    } else if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
        if (held_slot == idx) {
            bool repeated = hold.release();
            skip_click[idx] = repeated || code == LV_EVENT_PRESS_LOST;
            if (repeated)
                ble_release_keys();
            held_slot = -1;
        }
        if (lv_obj_get_child_count(btn) > 1) {
            lv_obj_t *img = lv_obj_get_child(btn, 0);
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon), 0);
        }
    }
}

static lv_style_t style_btn;
static lv_style_t style_btn_pr;
static bool ui_initialized = false;

void ui_init() {
    cancel_hold();
    edge.reset();
    settings_open = false;
    settings_panel = nullptr;
    icon_cache_release();
    lv_obj_t *slot_images[8] = {};
    if (ui_initialized) {
        lv_style_reset(&style_btn);
        lv_style_reset(&style_btn_pr);
    }
    ui_initialized = true;

    lv_obj_t *scr = lv_screen_active();
    lv_obj_set_style_bg_color(scr, lv_color_hex(g_theme.background), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    surface_prepare();
    if (surface_background()) {
        lv_obj_t *wallpaper = lv_image_create(scr);
        lv_image_set_src(wallpaper, surface_background());
        lv_obj_set_pos(wallpaper, 0, 0);
        lv_obj_set_size(wallpaper, 800, 480);
        lv_obj_set_clickable(wallpaper, false);
    }
    if (!surface_ok())
        Serial.printf("[Surface] %s; using available color/image fallback\n", surface_error());
    Serial.printf("[Surface] Cached bytes: %u; free PSRAM: %u\n", (unsigned)surface_bytes(),
                  (unsigned)ESP.getFreePsram());

    lv_obj_t *cont = lv_obj_create(scr);
    main_panel = cont;
    lv_obj_set_size(cont, LV_PCT(100), LV_PCT(100));
    lv_obj_center(cont);
    lv_obj_set_style_bg_opa(cont, 0, 0);
    lv_obj_set_style_border_width(cont, 0, 0);
    lv_obj_set_style_pad_all(cont, 30, 0);
    lv_obj_set_style_pad_row(cont, 30, 0);
    lv_obj_set_style_pad_column(cont, 30, 0);
    lv_obj_set_scroll_dir(cont, LV_DIR_NONE);
    lv_obj_set_scrollbar_mode(cont, LV_SCROLLBAR_MODE_OFF);

    static int32_t col_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_FR(1),
                                LV_GRID_TEMPLATE_LAST};
    static int32_t row_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
    lv_obj_set_grid_dsc_array(cont, col_dsc, row_dsc);

    lv_style_init(&style_btn);
    lv_style_set_bg_color(&style_btn, lv_color_hex(g_theme.button));
    lv_style_set_bg_opa(&style_btn, g_surface.opacity);
    lv_style_set_border_width(&style_btn, 2);
    lv_style_set_border_color(&style_btn, lv_color_hex(g_theme.border));
    lv_style_set_border_opa(&style_btn, 160);
    lv_style_set_radius(&style_btn, 24);
    lv_style_set_transform_scale_x(&style_btn, 256);
    lv_style_set_transform_scale_y(&style_btn, 256);
    lv_style_set_transform_width(&style_btn, 0);
    lv_style_set_transform_height(&style_btn, 0);
    lv_style_set_transform_pivot_x(&style_btn, LV_PCT(50));
    lv_style_set_transform_pivot_y(&style_btn, LV_PCT(50));
    lv_style_set_shadow_width(&style_btn, 0);
    lv_style_set_shadow_opa(&style_btn, LV_OPA_COVER);

    // Text default
    lv_style_set_text_color(&style_btn, lv_color_hex(g_theme.text));
    lv_style_set_text_font(&style_btn, &lv_font_montserrat_24);

    lv_style_init(&style_btn_pr);
    // We supply the pressed colors ourselves. LVGL's theme darkening
    // also recolors cached glass images, bypassing their rounded clipping path.
    lv_style_set_recolor_opa(&style_btn_pr, LV_OPA_TRANSP);
    lv_style_set_transform_scale_x(&style_btn_pr, 256);
    lv_style_set_transform_scale_y(&style_btn_pr, 256);
    // The default theme also grows width/height with its own delayed return.
    // Disable it explicitly so no hidden resize animation survives rapid taps.
    lv_style_set_transform_width(&style_btn_pr, 0);
    lv_style_set_transform_height(&style_btn_pr, 0);
    lv_style_set_shadow_color(&style_btn_pr, lv_color_hex(g_theme.button_press));
    lv_style_set_shadow_width(&style_btn_pr, 30);
    lv_style_set_shadow_spread(&style_btn_pr, 4);
    lv_style_set_shadow_opa(&style_btn_pr, 255);
    // The configuration names the pressed fill color "animation".
    lv_style_set_bg_color(&style_btn_pr, lv_color_hex(g_theme.animation));
    lv_style_set_text_color(&style_btn_pr, lv_color_hex(g_theme.text_pressed));
    lv_style_set_border_color(&style_btn_pr, lv_color_hex(g_theme.border_pressed));

    for (int i = 0; i < 8; ++i) {
        int col = i % 4;
        int row = i / 4;

        lv_obj_t *btn = lv_button_create(cont);
        lv_obj_set_grid_cell(btn, LV_GRID_ALIGN_STRETCH, col, 1, LV_GRID_ALIGN_STRETCH, row, 1);

        lv_obj_add_style(btn, &style_btn, LV_STATE_DEFAULT);
        lv_obj_add_style(btn, &style_btn_pr, LV_STATE_PRESSED);
        if (surface_button(i, false)) {
            lv_obj_set_style_bg_opa(btn, LV_OPA_TRANSP, LV_STATE_DEFAULT);
            lv_obj_set_style_bg_opa(btn, LV_OPA_TRANSP, LV_STATE_PRESSED);
            lv_obj_set_style_bg_image_src(btn, surface_button(i, false), LV_STATE_DEFAULT);
            lv_obj_set_style_bg_image_src(btn, surface_button(i, true), LV_STATE_PRESSED);
        }

        lv_obj_set_checkable(btn, false);
        lv_obj_set_scroll_on_focus(btn, false);
        lv_obj_set_click_focusable(btn, false);
        lv_obj_set_scroll_dir(btn, LV_DIR_NONE);
        lv_obj_set_style_outline_opa(btn, LV_OPA_TRANSP, LV_STATE_FOCUSED);

        lv_obj_set_layout(btn, LV_LAYOUT_FLEX);
        lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(btn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER,
                              LV_FLEX_ALIGN_CENTER);

        lv_obj_t *img = nullptr;
        if (g_buttons[i].icon_path.length() > 0) {
            img = lv_image_create(btn);
            lv_image_set_src(img, g_buttons[i].icon_path.c_str());
            lv_obj_set_width(img, LV_PCT(100));
            lv_obj_set_flex_grow(img, 1);
            lv_obj_set_style_pad_bottom(img, 4, 0);
            // Default image recolor
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon), 0);
            lv_obj_set_style_image_recolor_opa(img, LV_OPA_COVER, 0);
        }

        lv_obj_t *label = lv_label_create(btn);
        lv_label_set_text(label, g_buttons[i].label.c_str());
        if (img) {
            lv_image_set_inner_align(img, LV_IMAGE_ALIGN_CONTAIN_DOWNSCALE);
            slot_images[i] = img;
        }
        lv_obj_add_event_cb(btn, btn_event_cb, LV_EVENT_ALL, (void *)(intptr_t)i);
    }
    lv_obj_update_layout(scr);
    for (int i = 0; i < 8; ++i) {
        if (slot_images[i] && !icon_cache_prepare(slot_images[i], i))
            Serial.printf("[Icons] Could not prepare slot %d; using original source\n", i + 1);
    }
}

void ui_rebuild() {
    cancel_hold();
    lv_obj_clean(lv_screen_active());
    ui_init();
    display_refresh_sync();
}

namespace {
lv_obj_t *text(lv_obj_t *parent, const char *value, int x, int y) {
    auto *label = lv_label_create(parent);
    lv_label_set_text(label, value);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_style_text_color(label, lv_color_hex(g_theme.text), 0);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_24, 0);
    return label;
}
lv_obj_t *control(lv_obj_t *parent, int x, int y, int width, int height, const char *value,
                  lv_event_cb_t callback) {
    auto *button = lv_button_create(parent);
    lv_obj_set_pos(button, x, y);
    lv_obj_set_size(button, width, height);
    lv_obj_add_style(button, &style_btn, 0);
    lv_obj_add_style(button, &style_btn_pr, LV_STATE_PRESSED);
    lv_obj_set_scroll_dir(button, LV_DIR_NONE);
    auto *label = text(button, value, 0, 0);
    lv_obj_center(label);
    lv_obj_remove_local_style_prop(label, LV_STYLE_TEXT_COLOR, 0);
    lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, nullptr);
    return label;
}
void update_status() {
    lv_label_set_text(settings_status, display_brightness_available()
                                           ? device_settings_error()
                                           : "Backlight control unavailable");
}
void back_clicked(lv_event_t *) { show_settings(false); }
void info_clicked(lv_event_t *) {
    lv_label_set_text_fmt(settings_status, "Bluetooth: %s | Screen: 800 x 480\nFree PSRAM: %u KiB",
                          ble_connected() ? "connected" : "waiting for host",
                          unsigned(ESP.getFreePsram() / 1024));
}
void restart_clicked(lv_event_t *) {
    if (restart_armed && uint32_t(lv_tick_get() - restart_time) < 4000) {
        cancel_hold();
        device_restart();
        return;
    }
    restart_armed = true;
    restart_time = lv_tick_get();
    lv_label_set_text(restart_text, "Confirm restart");
    lv_label_set_text(settings_status, "Tap again to restart StreamTouch only.");
}
void brightness_changed(lv_event_t *event) {
    auto *slider = static_cast<lv_obj_t *>(lv_event_get_target(event));
    auto value = lv_slider_get_value(slider);
    device_set_brightness(value, lv_event_get_code(event) != LV_EVENT_VALUE_CHANGED);
    lv_label_set_text_fmt(brightness_text, "%d%%", int(device_brightness()));
    lv_label_set_text(settings_status, device_settings_error());
}
void make_settings() {
    settings_panel = lv_obj_create(lv_screen_active());
    lv_obj_set_pos(settings_panel, 0, 0);
    lv_obj_set_size(settings_panel, 800, 480);
    lv_obj_set_style_bg_opa(settings_panel, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(settings_panel, 0, 0);
    lv_obj_set_style_pad_all(settings_panel, 0, 0);
    lv_obj_set_scroll_dir(settings_panel, LV_DIR_NONE);
    lv_obj_set_scrollbar_mode(settings_panel, LV_SCROLLBAR_MODE_OFF);
    text(settings_panel, "Device settings", 30, 38);
    control(settings_panel, 620, 24, 150, 58, "Back", back_clicked);
    text(settings_panel, "Screen brightness", 30, 122);
    brightness_text = text(settings_panel, "", 675, 122);
    lv_label_set_text_fmt(brightness_text, "%d%%", int(device_brightness()));
    auto *slider = lv_slider_create(settings_panel);
    lv_obj_set_pos(slider, 50, 185);
    lv_obj_set_size(slider, 700, 24);
    lv_slider_set_range(slider, 10, 100);
    lv_slider_set_value(slider, device_brightness(), LV_ANIM_OFF);
    lv_obj_set_style_bg_color(slider, lv_color_hex(g_theme.button), LV_PART_MAIN);
    lv_obj_set_style_bg_color(slider, lv_color_hex(g_theme.button_press), LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(slider, lv_color_hex(g_theme.icon), LV_PART_KNOB);
    if (!display_brightness_available())
        lv_obj_add_state(slider, LV_STATE_DISABLED);
    lv_obj_add_event_cb(slider, brightness_changed, LV_EVENT_VALUE_CHANGED, nullptr);
    lv_obj_add_event_cb(slider, brightness_changed, LV_EVENT_RELEASED, nullptr);
    lv_obj_add_event_cb(slider, brightness_changed, LV_EVENT_PRESS_LOST, nullptr);
    control(settings_panel, 30, 260, 355, 90, "Device info", info_clicked);
    restart_text = control(settings_panel, 415, 260, 355, 90, "Restart device", restart_clicked);
    settings_status = text(settings_panel, "", 30, 375);
    lv_obj_set_width(settings_status, 740);
    lv_label_set_long_mode(settings_status, LV_LABEL_LONG_WRAP);
    text(settings_panel, "Swipe up from the bottom edge to return", 30, 438);
    update_status();
}
void show_settings(bool open) {
    cancel_hold();
    restart_armed = false;
    if (!settings_panel)
        make_settings();
    settings_open = open;
    lv_obj_set_hidden(main_panel, open);
    lv_obj_set_hidden(settings_panel, !open);
    lv_label_set_text(restart_text, "Restart device");
    if (open)
        update_status();
}
} // namespace
bool ui_filter_touch(bool pressed, int x, int y) { return edge.feed(pressed, x, y, settings_open); }
void ui_loop() {
    if (edge.take_toggle())
        show_settings(!settings_open);
    if (settings_open && restart_armed && uint32_t(lv_tick_get() - restart_time) >= 4000) {
        restart_armed = false;
        lv_label_set_text(restart_text, "Restart device");
        update_status();
    }
    if (held_slot >= 0) {
        if (!ble_connected() || settings_open) {
            cancel_hold();
            return;
        }
        if (hold.poll(lv_tick_get()))
            ble_send_keys(g_buttons[held_slot].keys, g_buttons[held_slot].media_keys);
    }
}
