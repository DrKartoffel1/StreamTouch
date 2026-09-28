#include <cstdio>
#include <Arduino.h>
#include "ui.h"
#include "config.h"
#include "ble_macropad.h"



static void btn_event_cb(lv_event_t * e) {
    lv_event_code_t code = lv_event_get_code(e);
    int idx = (int)(intptr_t)lv_event_get_user_data(e);
    lv_obj_t * btn = (lv_obj_t *)lv_event_get_target(e);
    
    if (code == LV_EVENT_CLICKED) {
        ble_send_keys(g_buttons[idx].keys, g_buttons[idx].media_keys);
    } else if (code == LV_EVENT_PRESSED) {
        if (lv_obj_get_child_cnt(btn) > 1) {
            lv_obj_t *img = lv_obj_get_child(btn, 0);
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon_pressed), 0);
        }
    } else if (code == LV_EVENT_RELEASED) {
        if (lv_obj_get_child_cnt(btn) > 1) {
            lv_obj_t *img = lv_obj_get_child(btn, 0);
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon), 0);
        }
    }
}

static lv_style_t style_btn;
static lv_style_t style_btn_pr;
static lv_style_transition_dsc_t trans;
static bool ui_initialized = false;

void ui_init() {
    if (ui_initialized) {
        lv_style_reset(&style_btn);
        lv_style_reset(&style_btn_pr);
    }
    ui_initialized = true;

    lv_obj_t *scr = lv_screen_active();
    lv_obj_set_style_bg_color(scr, lv_color_hex(g_theme.background), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    lv_obj_t *cont = lv_obj_create(scr);
    lv_obj_set_size(cont, LV_PCT(100), LV_PCT(100));
    lv_obj_center(cont);
    lv_obj_set_style_bg_opa(cont, 0, 0);
    lv_obj_set_style_border_width(cont, 0, 0);
    lv_obj_set_style_pad_all(cont, 30, 0);  
    lv_obj_set_style_pad_row(cont, 30, 0);
    lv_obj_set_style_pad_column(cont, 30, 0);
    lv_obj_set_scroll_dir(cont, LV_DIR_NONE);
    lv_obj_set_scrollbar_mode(cont, LV_SCROLLBAR_MODE_OFF);

    static int32_t col_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
    static int32_t row_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
    lv_obj_set_grid_dsc_array(cont, col_dsc, row_dsc);

    static const lv_style_prop_t props[] = {LV_STYLE_TRANSFORM_SCALE_X, LV_STYLE_TRANSFORM_SCALE_Y, LV_STYLE_BG_OPA, LV_STYLE_SHADOW_WIDTH, LV_STYLE_SHADOW_OPA, LV_STYLE_TEXT_COLOR, LV_STYLE_BG_COLOR, (lv_style_prop_t)0};
    lv_style_transition_dsc_init(&trans, props, lv_anim_path_overshoot, 50, 0, NULL);

    lv_style_init(&style_btn);
    lv_style_set_bg_color(&style_btn, lv_color_hex(g_theme.button));
    lv_style_set_bg_opa(&style_btn, 160); 
    lv_style_set_border_width(&style_btn, 2);
    lv_style_set_border_color(&style_btn, lv_color_hex(g_theme.border));
    lv_style_set_border_opa(&style_btn, 160); 
    lv_style_set_radius(&style_btn, 24); 
    lv_style_set_transform_scale_x(&style_btn, 256);
    lv_style_set_transform_scale_y(&style_btn, 256);
    lv_style_set_transform_pivot_x(&style_btn, LV_PCT(50)); 
    lv_style_set_transform_pivot_y(&style_btn, LV_PCT(50)); 
    lv_style_set_shadow_width(&style_btn, 0);
    lv_style_set_transition(&style_btn, &trans);
    
    // Text default
    lv_style_set_text_color(&style_btn, lv_color_hex(g_theme.text)); 
    lv_style_set_text_font(&style_btn, &lv_font_montserrat_24);

    lv_style_init(&style_btn_pr);
    lv_style_set_transform_scale_x(&style_btn_pr, 240); 
    lv_style_set_transform_scale_y(&style_btn_pr, 240);
    lv_style_set_shadow_color(&style_btn_pr, lv_color_hex(g_theme.button_press)); 
    lv_style_set_shadow_width(&style_btn_pr, 30);
    lv_style_set_shadow_spread(&style_btn_pr, 4);
    lv_style_set_shadow_opa(&style_btn_pr, 255);
    // When pressed, use animation color for background (as per teal button press design before)
    lv_style_set_bg_color(&style_btn_pr, lv_color_hex(g_theme.animation));
    lv_style_set_text_color(&style_btn_pr, lv_color_hex(g_theme.text_pressed));
    lv_style_set_border_color(&style_btn_pr, lv_color_hex(g_theme.border_pressed));

    for (int i = 0; i < 8; ++i) {
        int col = i % 4;
        int row = i / 4;

        lv_obj_t *btn = lv_button_create(cont);
        lv_obj_set_grid_cell(btn,
            LV_GRID_ALIGN_STRETCH, col, 1,
            LV_GRID_ALIGN_STRETCH, row, 1);

        lv_obj_add_style(btn, &style_btn, LV_STATE_DEFAULT);
        lv_obj_add_style(btn, &style_btn_pr, LV_STATE_PRESSED);

        lv_obj_remove_flag(btn, LV_OBJ_FLAG_CHECKABLE);
        lv_obj_remove_flag(btn, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
        lv_obj_remove_flag(btn, LV_OBJ_FLAG_CLICK_FOCUSABLE);
        lv_obj_set_scroll_dir(btn, LV_DIR_NONE);
        lv_obj_set_style_outline_opa(btn, LV_OPA_TRANSP, LV_STATE_FOCUSED);

        lv_obj_set_layout(btn, LV_LAYOUT_FLEX);
        lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(btn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        if (g_buttons[i].icon_path.length() > 0) {
            lv_obj_t *img = lv_image_create(btn);
            lv_image_set_src(img, g_buttons[i].icon_path.c_str());
            lv_obj_set_width(img, LV_PCT(100));
            lv_obj_set_flex_grow(img, 1);
            lv_image_set_inner_align(img, LV_IMAGE_ALIGN_CONTAIN_DOWNSCALE);
            lv_obj_set_style_pad_bottom(img, 4, 0); 
            // Default image recolor
            lv_obj_set_style_image_recolor(img, lv_color_hex(g_theme.icon), 0);
            lv_obj_set_style_image_recolor_opa(img, LV_OPA_COVER, 0);
        }

        lv_obj_t *label = lv_label_create(btn);
        lv_label_set_text(label, g_buttons[i].label.c_str());
        lv_obj_add_event_cb(btn, btn_event_cb, LV_EVENT_ALL, (void*)(intptr_t)i);
    }
}

void ui_rebuild() {
    lv_obj_clean(lv_screen_active());
    ui_init();
}
