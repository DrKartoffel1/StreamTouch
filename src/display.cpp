#include "display.h"
#include <Arduino.h>
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"
#include <TAMC_GT911.h>
#include <Wire.h>

#define LCD_H_RES 800
#define LCD_V_RES 480
#define LCD_PIXEL_CLOCK_HZ (16 * 1000 * 1000)

// GT911 pins
#define TOUCH_SDA 19
#define TOUCH_SCL 20
#define TOUCH_INT 18
#define TOUCH_RST 38

TAMC_GT911 touch = TAMC_GT911(TOUCH_SDA, TOUCH_SCL, TOUCH_INT, TOUCH_RST, LCD_H_RES, LCD_V_RES);

static lv_display_t *disp;
static lv_indev_t *indev;

static bool on_color_trans_done(esp_lcd_panel_handle_t panel, const esp_lcd_rgb_panel_event_data_t *edata, void *user_ctx) {
    lv_display_flush_ready(disp);
    return false;
}

static void lv_flush_cb(lv_display_t *display, const lv_area_t *area, uint8_t *px_map) {
    esp_lcd_panel_handle_t panel_handle = (esp_lcd_panel_handle_t)lv_display_get_user_data(display);
    esp_lcd_panel_draw_bitmap(panel_handle, area->x1, area->y1, area->x2 + 1, area->y2 + 1, px_map);
}

static void lv_touch_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {
    touch.read();
    if (touch.isTouched) {
        data->state = LV_INDEV_STATE_PRESSED;
        data->point.x = touch.points[0].x;
        data->point.y = touch.points[0].y;
        Serial.printf("Touch: %d, %d\n", data->point.x, data->point.y);
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

void display_init(bool init_touch) {
    // 1. Initialize GT911
    if (init_touch) {
        Wire.setBufferSize(256);
        Wire.begin(TOUCH_SDA, TOUCH_SCL);
        Wire.setClock(400000);
        touch.begin();
        touch.setRotation(ROTATION_INVERTED);
    }

    // 2. Initialize RGB Panel
    esp_lcd_rgb_panel_config_t panel_config = {
        .clk_src = LCD_CLK_SRC_PLL160M,
        .timings = {
            .pclk_hz = LCD_PIXEL_CLOCK_HZ,
            .h_res = LCD_H_RES,
            .v_res = LCD_V_RES,
            .hsync_pulse_width = 4,
            .hsync_back_porch = 43,
            .hsync_front_porch = 8,
            .vsync_pulse_width = 4,
            .vsync_back_porch = 12,
            .vsync_front_porch = 8,
            .flags = {
                .pclk_active_neg = true, 
            },
        },
        .data_width = 16,
        .bits_per_pixel = 16,
        .num_fbs = 1,
        .bounce_buffer_size_px = LCD_H_RES * 10,
        .hsync_gpio_num = 39,
        .vsync_gpio_num = 41,
        .de_gpio_num = 40,
        .pclk_gpio_num = 42,
        .disp_gpio_num = -1,
        .data_gpio_nums = {
            45, 48, 47, 21, 14, // B0-B4
            5, 6, 7, 15, 16, 4, // G0-G5
            8, 3, 46, 9, 1      // R0-R4
        },
        .flags = {
            .fb_in_psram = true,
            .bb_invalidate_cache = true,
        },
    };

    esp_lcd_panel_handle_t panel_handle;
    ESP_ERROR_CHECK(esp_lcd_new_rgb_panel(&panel_config, &panel_handle));
    void *fb; esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 1, &fb); if (fb) memset(fb, 0, LCD_H_RES * LCD_V_RES * 2);
    
    esp_lcd_rgb_panel_event_callbacks_t cbs = { .on_color_trans_done = on_color_trans_done };
    ESP_ERROR_CHECK(esp_lcd_rgb_panel_register_event_callbacks(panel_handle, &cbs, NULL));
    
    ESP_ERROR_CHECK(esp_lcd_panel_reset(panel_handle));
    ESP_ERROR_CHECK(esp_lcd_panel_init(panel_handle));

    // Turn on backlight
    pinMode(2, OUTPUT);
    digitalWrite(2, HIGH);

    // 3. Initialize LVGL
    lv_init();
    
    // Create display
    disp = lv_display_create(LCD_H_RES, LCD_V_RES);
    lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
    lv_display_set_user_data(disp, panel_handle);
    lv_display_set_flush_cb(disp, lv_flush_cb);
    
    // Allocate a full-screen draw buffer in PSRAM to eliminate UI redraw chunking
    void *buf1 = heap_caps_malloc(LCD_H_RES * LCD_V_RES * 2, MALLOC_CAP_SPIRAM);
    lv_display_set_buffers(disp, buf1, NULL, LCD_H_RES * LCD_V_RES * 2, LV_DISPLAY_RENDER_MODE_PARTIAL);

    // Create input device
    if (init_touch) {
        indev = lv_indev_create();
        lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
        lv_indev_set_read_cb(indev, lv_touch_read_cb);
    }
}

void display_loop() {
    static uint32_t last_tick = 0;
    uint32_t current_tick = millis();
    lv_tick_inc(current_tick - last_tick);
    last_tick = current_tick;
    lv_timer_handler();
}
