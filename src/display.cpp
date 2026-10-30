#include "display.h"
#include "backlight.h"
#include "ui.h"
#include "display_frames.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"
#include "icon_cache.h"
#include "navigation.h"
#include "touch_report.h"
#include <Arduino.h>
#include <TAMC_GT911.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#define LCD_H_RES 800
#define LCD_V_RES 480
#define LCD_PIXEL_CLOCK_HZ (16 * 1000 * 1000)

// GT911 pins
#define TOUCH_SDA 19
#define TOUCH_SCL 20
#define TOUCH_INT 18
#define TOUCH_RST 38

static lv_display_t *disp;
static lv_indev_t *indev;
static esp_lcd_panel_handle_t s_panel_handle = NULL;
static bool s_panel_started = false;
static DisplayFrames s_frames;
static SemaphoreHandle_t s_swap_complete;
static volatile bool s_swap_pending = false;
static portMUX_TYPE s_present_mux = portMUX_INITIALIZER_UNLOCKED;
static BaseType_t s_display_core;
static uint32_t s_frames_presented = 0, s_strips = 0;
static uint32_t s_frame_started = 0, s_last_build_us = 0, s_last_wait_us = 0;
static bool s_building = false;
static uint16_t *s_thumbnail = nullptr;
static TouchReport s_touch;
static constexpr unsigned TOUCH_PERIOD_MS = 5;
static uint32_t clock_ms() { return millis(); }

static void render_started(lv_event_t *) {
    if (s_thumbnail)
        return;
    s_frame_started = micros();
    s_building = true;
}

static bool IRAM_ATTR frame_consumed(esp_lcd_panel_handle_t, const esp_lcd_rgb_panel_event_data_t *,
                                     void *) {
    // Driver IRQs are allocated on the setup/loop core. Keep publication atomic
    // against the whole ISR, including its framebuffer latch before this callback.
    configASSERT(xPortGetCoreID() == s_display_core);
    BaseType_t wake = pdFALSE;
    if (s_swap_pending) {
        s_swap_pending = false;
        xSemaphoreGiveFromISR(s_swap_complete, &wake);
    }
    return wake == pdTRUE;
}

static void present_frame(bool navigation = false) {
    configASSERT(xPortGetCoreID() == s_display_core);
    if (s_panel_started) {
        uint32_t started = micros();
        // Bounce mode's draw_bitmap selects the next framebuffer without
        // copying it. The completion IRQ latches it at a whole-frame boundary.
        portENTER_CRITICAL(&s_present_mux);
        s_swap_pending = true;
        esp_err_t result = esp_lcd_panel_draw_bitmap(s_panel_handle, 0, 0, LCD_H_RES, LCD_V_RES,
                                                     s_frames.pending());
        portEXIT_CRITICAL(&s_present_mux);
        ESP_ERROR_CHECK(result);
        if (xSemaphoreTake(s_swap_complete, pdMS_TO_TICKS(1000)) != pdTRUE) {
            Serial.println("[Display] Frame handoff timed out; refusing to overwrite scanout");
            ESP_ERROR_CHECK(ESP_ERR_TIMEOUT);
        }
        s_last_wait_us = micros() - started;
        if (navigation)
            s_frames.presented_full_frame();
        else
            s_frames.presented();
        ++s_frames_presented;
    } else {
        s_frames.seed_front();
    }
}

static void lv_flush_cb(lv_display_t *display, const lv_area_t *area, uint8_t *px_map) {
    configASSERT(xPortGetCoreID() == s_display_core);
    if (s_thumbnail) {
        size_t stride =
            lv_draw_buf_width_to_stride(area->x2 - area->x1 + 1, LV_COLOR_FORMAT_RGB565);
        for (int y = (area->y1 + 1) & ~1; y <= area->y2; y += 2) {
            const auto *row = reinterpret_cast<const uint16_t *>(px_map + (y - area->y1) * stride);
            for (int x = (area->x1 + 1) & ~1; x <= area->x2; x += 2)
                s_thumbnail[(y / 2) * 400 + x / 2] = row[x - area->x1];
        }
        lv_display_flush_ready(display);
        return;
    }
    if (!s_building) {
        s_frame_started = micros();
        s_building = true;
    }
    ++s_strips;
    size_t stride = lv_draw_buf_width_to_stride(area->x2 - area->x1 + 1, LV_COLOR_FORMAT_RGB565);
    s_frames.stage(area->x1, area->y1, area->x2, area->y2, px_map, stride);
    if (lv_display_flush_is_last(display)) {
        s_last_build_us = micros() - s_frame_started;
        if (navigation_active())
            navigation_record_frame(s_last_build_us);
        present_frame();
        s_building = false;
    }
    lv_display_flush_ready(display);
}

static void lv_touch_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {
    uint8_t packet[9];
    Wire.beginTransmission(GT911_ADDR1);
    Wire.write(uint8_t(GT911_POINT_INFO >> 8));
    Wire.write(uint8_t(GT911_POINT_INFO));
    if (Wire.endTransmission() == 0 &&
        Wire.requestFrom(uint8_t(GT911_ADDR1), uint8_t(sizeof(packet))) == sizeof(packet)) {
        for (auto &byte : packet)
            byte = Wire.read();
        s_touch.update(packet, sizeof(packet));
        if (packet[0] & 0x80) {
            // Acknowledge fresh reports only. Missing/stale data retains the last
            // valid state; it must not fabricate releases or repeated clicks.
            Wire.beginTransmission(GT911_ADDR1);
            Wire.write(uint8_t(GT911_POINT_INFO >> 8));
            Wire.write(uint8_t(GT911_POINT_INFO));
            Wire.write(uint8_t(0));
            Wire.endTransmission();
        }
    }
    if (ui_filter_touch(s_touch.pressed, s_touch.x, s_touch.y)) {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }
    if (s_touch.pressed) {
        data->state = LV_INDEV_STATE_PRESSED;
        // Preserve the calibrated raw GT911 orientation.
        data->point.x = s_touch.x;
        data->point.y = s_touch.y;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

void display_init(bool init_touch) {
    s_display_core = xPortGetCoreID();
    s_swap_complete = xSemaphoreCreateBinary();
    configASSERT(s_swap_complete);
    // Keep backlight off until initial UI render and RGB DMA startup complete
    backlight::prepare();

    // 1. Initialize GT911
    if (init_touch) {
        TAMC_GT911 touch(TOUCH_SDA, TOUCH_SCL, TOUCH_INT, TOUCH_RST, LCD_H_RES, LCD_V_RES);
        Wire.setBufferSize(256);
        Wire.begin(TOUCH_SDA, TOUCH_SCL);
        Wire.setClock(400000);
        touch.begin();
        Wire.setTimeOut(5);
    }

    // 2. Allocate RGB Panel and PSRAM framebuffer (do not start DMA scanout until display_start)
    esp_lcd_rgb_panel_config_t panel_config = {
        .clk_src = LCD_CLK_SRC_PLL160M,
        .timings =
            {
                .pclk_hz = LCD_PIXEL_CLOCK_HZ,
                .h_res = LCD_H_RES,
                .v_res = LCD_V_RES,
                .hsync_pulse_width = 4,
                .hsync_back_porch = 43,
                .hsync_front_porch = 8,
                .vsync_pulse_width = 4,
                .vsync_back_porch = 12,
                .vsync_front_porch = 8,
                .flags =
                    {
                        .pclk_active_neg = true,
                    },
            },
        .data_width = 16,
        .bits_per_pixel = 16,
        .num_fbs = 2,
        .bounce_buffer_size_px = LCD_H_RES * 16,
        .hsync_gpio_num = 39,
        .vsync_gpio_num = 41,
        .de_gpio_num = 40,
        .pclk_gpio_num = 42,
        .disp_gpio_num = -1,
        .data_gpio_nums =
            {
                45, 48, 47, 21, 14, // B0-B4
                5, 6, 7, 15, 16, 4, // G0-G5
                8, 3, 46, 9, 1      // R0-R4
            },
        .flags =
            {
                .fb_in_psram = true,
                .bb_invalidate_cache = false,
            },
    };
    panel_config.dma_burst_size = 64;

    ESP_ERROR_CHECK(esp_lcd_new_rgb_panel(&panel_config, &s_panel_handle));
    void *front = nullptr, *back = nullptr;
    ESP_ERROR_CHECK(esp_lcd_rgb_panel_get_frame_buffer(s_panel_handle, 2, &front, &back));
    s_frames.begin(static_cast<uint16_t *>(front), static_cast<uint16_t *>(back));
    esp_lcd_rgb_panel_event_callbacks_t callbacks = {};
    callbacks.on_frame_buf_complete = frame_consumed;
    ESP_ERROR_CHECK(
        esp_lcd_rgb_panel_register_event_callbacks(s_panel_handle, &callbacks, nullptr));

    // 3. Initialize LVGL
    lv_init();
    // Rendering/presentation can block. Animation time must still reflect the
    // current clock instead of the time sampled before the previous frame.
    lv_tick_set_cb(clock_ms);

    // Create display
    disp = lv_display_create(LCD_H_RES, LCD_V_RES);
    lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
    lv_display_set_flush_cb(disp, lv_flush_cb);
    lv_display_add_event_cb(disp, render_started, LV_EVENT_RENDER_START, nullptr);

    // Allocate draw buffer in fast internal SRAM (32KB = 20 lines) to avoid PSRAM cache/bus
    // contention
    uint32_t buf_size = LCD_H_RES * 20 * 2;
    void *buf1 = heap_caps_malloc(buf_size, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!buf1) {
        buf1 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM);
    }
    if (buf1) {
        memset(buf1, 0, buf_size);
    }
    configASSERT(buf1);
    lv_display_set_buffers(disp, buf1, NULL, buf_size, LV_DISPLAY_RENDER_MODE_PARTIAL);

    // Create input device
    if (init_touch) {
        indev = lv_indev_create();
        lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
        lv_indev_set_read_cb(indev, lv_touch_read_cb);
        lv_timer_set_period(lv_indev_get_read_timer(indev), TOUCH_PERIOD_MS);
        lv_timer_pause(lv_indev_get_read_timer(indev));
    }
}

void display_start() {
    if (!s_panel_handle)
        return;

    // 1. Force synchronous LVGL layout calculation, SD-card PNG icon decoding, and full-screen
    // render into the PSRAM framebuffer BEFORE the RGB LCD DMA / bounce-buffer ISR is even started.
    lv_obj_invalidate(lv_screen_active());
    lv_refr_now(NULL);

    // 2. Now start the RGB LCD panel and GDMA bounce buffers from a clean, idle bus state
    ESP_ERROR_CHECK(esp_lcd_panel_reset(s_panel_handle));
    ESP_ERROR_CHECK(esp_lcd_panel_init(s_panel_handle));
    s_panel_started = true;

    // 3. Wait one full VSYNC frame (~20ms) for the first clean scanout before enabling backlight
    delay(25);
    backlight::start();
}

void display_refresh_sync() {
    if (!s_panel_handle)
        return;
    lv_obj_invalidate(lv_screen_active());
    lv_refr_now(NULL);
}

void display_copy_thumbnail(uint16_t *pixels) {
    const uint16_t *front = s_frames.front();
    for (int y = 0; y < 240; ++y)
        for (int x = 0; x < 400; ++x)
            pixels[y * 400 + x] = front[(y * 2) * 800 + x * 2];
}
void display_render_thumbnail(uint16_t *pixels) {
    s_thumbnail = pixels;
    lv_obj_invalidate(lv_screen_active());
    lv_refr_now(disp);
    s_thumbnail = nullptr;
    lv_obj_invalidate(lv_screen_active());
}
void display_begin_navigation() { lv_timer_pause(lv_display_get_refr_timer(disp)); }
uint16_t *display_navigation_buffer() { return s_frames.pending(); }
void display_present_navigation() { present_frame(true); }
void display_end_navigation() {
    lv_obj_invalidate(lv_screen_active());
    lv_timer_resume(lv_display_get_refr_timer(disp));
    lv_timer_ready(lv_display_get_refr_timer(disp));
}
void display_print_status() {
    Serial.printf("SYNC_DISPLAY:{\"double_buffered\":true,\"frames\":%u,\"strips\":%u,"
                  "\"last_build_us\":%u,\"last_handoff_us\":%u,\"free_psram\":%u,"
                  "\"touch_period_ms\":5,\"refresh_period_ms\":%u,"
                  "\"icons_cached\":%u,\"icon_cache_bytes\":%u,\"icon_cache_failures\":%u,"
                  "\"largest_psram_block\":%u,\"loop_stack_watermark\":%u,\"icon_cache_hits\":%u,"
                  "\"icon_decodes\":%u,\"navigation_bytes\":%u,\"navigation_frames\":%u,"
                  "\"navigation_blur\":%s,\"navigation_max_frame_us\":%u}\n",
                  (unsigned)s_frames_presented, (unsigned)s_strips, (unsigned)s_last_build_us,
                  (unsigned)s_last_wait_us, (unsigned)ESP.getFreePsram(), LV_DEF_REFR_PERIOD,
                  icon_cache_count(), (unsigned)icon_cache_bytes(), icon_cache_failures(),
                  (unsigned)ESP.getMaxAllocPsram(), (unsigned)uxTaskGetStackHighWaterMark(nullptr),
                  icon_cache_hits(), icon_cache_decodes(), unsigned(navigation_bytes()),
                  navigation_frames(), navigation_blur() ? "true" : "false",
                  unsigned(navigation_max_frame_us()));
}

void display_loop() {
    static uint32_t last_touch = 0;
    uint32_t now = millis();
    if (indev && now - last_touch >= TOUCH_PERIOD_MS) {
        last_touch = now;
        // Read before potentially expensive animation/render work, not after it.
        lv_indev_read(indev);
    }
    lv_timer_handler();
}

bool display_brightness_available() { return backlight::available(); }
bool display_set_brightness(unsigned percent) { return backlight::set(percent); }
