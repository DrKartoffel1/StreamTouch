import sys

with open('src/ui.cpp', 'r') as f:
    content = f.read()

replacement = """
#include <cstdio>
#include "ui.h"
#include "config.h"
#include "ble_macropad.h"

static void btn_event_cb(lv_event_t * e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_CLICKED) {
        int idx = (int)(intptr_t)lv_event_get_user_data(e);
        ble_send_keys(g_buttons[idx].keys, g_buttons[idx].media_keys);
    }
}

static lv_style_t style_btn;
static lv_style_t style_btn_pr;
static lv_style_transition_dsc_t trans;

void ui_init() {
    lv_obj_t *scr = lv_screen_active();
    // Beautiful deep synthwave abstract gradient for the background
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x0B0C10), 0); // Very dark teal/black
    lv_obj_set_style_bg_grad_color(scr, lv_color_hex(0x1F2833), 0); // Deep slate
    lv_obj_set_style_bg_grad_dir(scr, LV_GRAD_DIR_VER, 0);

    lv_obj_t *cont = lv_obj_create(scr);
    lv_obj_set_size(cont, LV_PCT(100), LV_PCT(100));
    lv_obj_center(cont);
    // Remove container background to let the screen gradient show through
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

    // Transitions
    static const lv_style_prop_t props[] = {LV_STYLE_TRANSFORM_SCALE_X, LV_STYLE_TRANSFORM_SCALE_Y, LV_STYLE_BG_OPA, LV_STYLE_SHADOW_WIDTH, (lv_style_prop_t)0};
    lv_style_transition_dsc_init(&trans, props, lv_anim_path_ease_out, 150, 0, NULL);

    lv_style_init(&style_btn);
    // Glassmorphism default
    lv_style_set_bg_color(&style_btn, lv_color_hex(0xFFFFFF)); // White base
    lv_style_set_bg_opa(&style_btn, 15); // Frosted 6% opacity
    lv_style_set_border_width(&style_btn, 1);
    lv_style_set_border_color(&style_btn, lv_color_hex(0xFFFFFF));
    lv_style_set_border_opa(&style_btn, 40); // Soft white border rim
    lv_style_set_radius(&style_btn, 24); // Large smooth rounded corners
    lv_style_set_transform_scale_x(&style_btn, 256);
    lv_style_set_transform_scale_y(&style_btn, 256);
    lv_style_set_transform_pivot_x(&style_btn, LV_PCT(50)); // Center pivot!
    lv_style_set_transform_pivot_y(&style_btn, LV_PCT(50)); // Center pivot!
    lv_style_set_shadow_width(&style_btn, 0);
    lv_style_set_transition(&style_btn, &trans);
    lv_style_set_text_color(&style_btn, lv_color_hex(0xFFFFFF));

    lv_style_init(&style_btn_pr);
    // Glassmorphism pressed
    lv_style_set_bg_opa(&style_btn_pr, 40); // Brighten glass on press
    lv_style_set_transform_scale_x(&style_btn_pr, 240); // Shrink perfectly toward center
    lv_style_set_transform_scale_y(&style_btn_pr, 240);
    lv_style_set_shadow_color(&style_btn_pr, lv_color_hex(0x66FCF1)); // Neon Cyan/Teal glow
    lv_style_set_shadow_width(&style_btn_pr, 50);
    lv_style_set_shadow_spread(&style_btn_pr, 10);
    lv_style_set_shadow_opa(&style_btn_pr, 150);

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
        }

        lv_obj_t *label = lv_label_create(btn);
        lv_label_set_text(label, g_buttons[i].label.c_str());
        lv_obj_add_event_cb(btn, btn_event_cb, LV_EVENT_CLICKED, (void*)(intptr_t)i);
    }
}
"""

with open('src/ui.cpp', 'w') as f:
    f.write(replacement)
