#include "config.h"
#include <SPI.h>
#include <SD.h>
#include <ArduinoJson.h>
#include <lvgl.h>

ButtonConfig g_buttons[8];
ThemeConfig g_theme = {
    0x008080, // icon (teal)
    0x2A2A2A, // button (dark gray)
    0x2A2A2A, // background (dark gray)
    0xB5AD00, // border (teal, wait, Slice 7 says swapped hex 0xB5AD00 but the color should be Teal in defaults or whatever it was previously)
    0xB5AD00, // button_press
    0xFFFFFF, // text (white)
    0xB5AD00, // animation
    0x000000, // text_pressed
    0x000000, // icon_pressed
    0xB5AD00  // border_pressed
};

#define TF_CS 10
#define TF_MOSI 11
#define TF_MISO 13
#define TF_SCLK 12

static lv_fs_drv_t drv;

static void* fs_open(lv_fs_drv_t *drv, const char *path, lv_fs_mode_t mode) {
    String p = path ? String(path) : String("");
    if (p.length() == 0 || p[0] != '/') p = "/" + p;
    File f = SD.open(p.c_str());
    if (!f) return nullptr;
    return new File(f);
}

static lv_fs_res_t fs_close(lv_fs_drv_t *drv, void *file_p) {
    File *fp = (File *)file_p;
    fp->close();
    delete fp;
    return LV_FS_RES_OK;
}

static lv_fs_res_t fs_read(lv_fs_drv_t *drv, void *file_p, void *buf, uint32_t btr, uint32_t *br) {
    File *fp = (File *)file_p;
    *br = fp->read((uint8_t *)buf, btr);
    return LV_FS_RES_OK;
}

static lv_fs_res_t fs_seek(lv_fs_drv_t *drv, void *file_p, uint32_t pos, lv_fs_whence_t whence) {
    File *fp = (File *)file_p;
    uint32_t target = 0;
    if (whence == LV_FS_SEEK_SET) target = pos;
    else if (whence == LV_FS_SEEK_CUR) target = fp->position() + pos;
    else if (whence == LV_FS_SEEK_END) target = fp->size() + (int32_t)pos;
    fp->seek(target);
    return LV_FS_RES_OK;
}

static lv_fs_res_t fs_tell(lv_fs_drv_t *drv, void *file_p, uint32_t *pos_p) {
    File *fp = (File *)file_p;
    *pos_p = fp->position();
    return LV_FS_RES_OK;
}

bool config_load() {
    for (int i = 0; i < 8; i++) {
        g_buttons[i].label = "Btn " + String(i + 1);
        g_buttons[i].icon_path = "";
        g_buttons[i].keys.clear();
        g_buttons[i].media_keys.clear();
    }

    File file = SD.open("/macros.json");
    if (!file) {
        Serial.println("Failed to open /macros.json");
        return true; // Use defaults
    }
    
    String sd_content = file.readString();
    Serial.println("=== MACROS.JSON ===");
    Serial.println(sd_content);
    Serial.println("===================");
    file.seek(0);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();
    
    if (error) {
        Serial.println("Failed to parse config.json");
        return true;
    }

    JsonObject theme = doc["theme"];
    if (!theme.isNull()) {
        auto parseColor = [](const String& hex) -> uint32_t {
            if (hex.length() > 0 && hex[0] == '#') {
                uint32_t rgb = strtol(hex.c_str() + 1, NULL, 16);
                uint8_t r = (rgb >> 16) & 0xFF;
                uint8_t g = (rgb >> 8) & 0xFF;
                uint8_t b = rgb & 0xFF;
                return (b << 16) | (g << 8) | r;
            }
            return 0;
        };
        if (theme["icon"].is<String>()) g_theme.icon = parseColor(theme["icon"]);
        if (theme["button"].is<String>()) g_theme.button = parseColor(theme["button"]);
        if (theme["background"].is<String>()) g_theme.background = parseColor(theme["background"]);
        if (theme["border"].is<String>()) g_theme.border = parseColor(theme["border"]);
        if (theme["button_press"].is<String>()) g_theme.button_press = parseColor(theme["button_press"]);
        if (theme["text"].is<String>()) g_theme.text = parseColor(theme["text"]);
        if (theme["animation"].is<String>()) g_theme.animation = parseColor(theme["animation"]);
        if (theme["text_pressed"].is<String>()) g_theme.text_pressed = parseColor(theme["text_pressed"]);
        if (theme["icon_pressed"].is<String>()) g_theme.icon_pressed = parseColor(theme["icon_pressed"]);
        if (theme["border_pressed"].is<String>()) g_theme.border_pressed = parseColor(theme["border_pressed"]);
    }

    JsonArray buttons = doc["tiles"];
    if (!buttons.isNull()) {
        int i = 0;
        for (JsonObject btn : buttons) {
            if (i >= 8) break;
            g_buttons[i].label = btn["label"] | String("Btn " + String(i + 1));
            String raw_path = btn["icon"] | "";
            if (raw_path.length() > 0) {
                if (raw_path.startsWith("/")) {
                    g_buttons[i].icon_path = "S:" + raw_path;
                } else {
                    g_buttons[i].icon_path = "S:/" + raw_path;
                }
            }
            
            g_buttons[i].keys.clear();
            g_buttons[i].media_keys.clear();
            
            JsonArray actions = btn["actions"];
            if (!actions.isNull()) {
                for (JsonObject a : actions) {
                    String type = a["type"] | "";
                    if (type == "keys" || type == "media" || type == "application") {
                        JsonArray keys = a["keys"];
                        if (!keys.isNull()) {
                            for (JsonVariant v : keys) {
                                String name = v.as<String>();
                                name.trim();
                                name.toUpperCase();
                                
                                uint16_t mcode = 0;
                                if (name == "NEXT" || name == "NEXT_TRACK" || name == "MEDIA_NEXT" || name == "MEDIA_NEXT_TRACK") mcode = 1;
                                else if (name == "PREV" || name == "PREVIOUS" || name == "PREVIOUS_TRACK" || name == "MEDIA_PREV" || name == "MEDIA_PREVIOUS_TRACK") mcode = 2;
                                else if (name == "STOP" || name == "MEDIA_STOP") mcode = 4;
                                else if (name == "PLAY" || name == "PLAY_PAUSE" || name == "PLAYPAUSE" || name == "MEDIA_PLAY" || name == "MEDIA_PLAY_PAUSE") mcode = 8;
                                else if (name == "MUTE" || name == "MEDIA_MUTE" || name == "MEDIA_VOLUME_MUTE") mcode = 16;
                                else if (name == "VOL_UP" || name == "VOLUME_UP" || name == "MEDIA_VOL_UP" || name == "MEDIA_VOLUME_UP") mcode = 32;
                                else if (name == "VOL_DOWN" || name == "VOLUME_DOWN" || name == "MEDIA_VOL_DOWN" || name == "MEDIA_VOLUME_DOWN") mcode = 64;
                                else if (name == "APP_BROWSER" || name == "BROWSER") mcode = 128; // {128, 0}
                                else if (name == "APP_CALCULATOR" || name == "CALCULATOR") mcode = 512; // {0, 2}
                                else if (name == "APP_FILE_EXPLORER" || name == "FILE_EXPLORER") mcode = 256; // {0, 1}
                                else if (name == "APP_EMAIL" || name == "EMAIL") mcode = 32768; // {0, 128}
                                
                                if (mcode != 0) {
                                    g_buttons[i].media_keys.push_back(mcode);
                                    continue;
                                }
                                
                                uint16_t code = 0;
                                if (name == "LEFT_CTRL" || name == "CTRL" || name == "CTRL_L") code = 0x80;
                                else if (name == "RIGHT_CTRL" || name == "CTRL_R") code = 0x84;
                                else if (name == "LEFT_SHIFT" || name == "SHIFT" || name == "SHIFT_L") code = 0x81;
                                else if (name == "RIGHT_SHIFT" || name == "SHIFT_R") code = 0x85;
                                else if (name == "LEFT_ALT" || name == "ALT" || name == "ALT_L") code = 0x82;
                                else if (name == "RIGHT_ALT" || name == "ALT_R") code = 0x86;
                                else if (name == "LEFT_GUI" || name == "GUI" || name == "WIN" || name == "META" || name == "CMD") code = 0x83;
                                else if (name == "RIGHT_GUI") code = 0x87;
                                else if (name == "SPACE" || name == "SPACEBAR") code = ' ';
                                else if (name == "ENTER" || name == "RETURN") code = 0xB0;
                                else if (name == "TAB") code = 0xB3;
                                else if (name == "ESC" || name == "ESCAPE") code = 0xB1;
                                else if (name == "BACKSPACE") code = 0xB2;
                                else if (name == "DELETE" || name == "DEL") code = 0xD4;
                                else if (name == "LEFT") code = 0xD8;
                                else if (name == "RIGHT") code = 0xD7;
                                else if (name == "UP") code = 0xDA;
                                else if (name == "DOWN") code = 0xD9;
                                else if (name.startsWith("F") && name.length() >= 2) {
                                    int fn = name.substring(1).toInt();
                                    if (fn >= 1 && fn <= 24) {
                                        static const uint16_t fkeys[24] = {
                                            0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
                                            0xCA, 0xCB, 0xCC, 0xCD,
                                            0xF0, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7,
                                            0xF8, 0xF9, 0xFA, 0xFB
                                        };
                                        code = fkeys[fn - 1];
                                    }
                                }
                                else if (name.length() == 1) {
                                    code = name.charAt(0);
                                    if (code >= 'A' && code <= 'Z') code = code - 'A' + 'a'; // BleKeyboard expects lowercase for standard letters
                                }
                                else {
                                    if (name == "MINUS") code = '-';
                                    else if (name == "EQUAL" || name == "EQUALS") code = '=';
                                }
                                
                                if (code != 0) g_buttons[i].keys.push_back(code);
                            }
                        }
                    }
                }
            }
            i++;
        }
    }
    return true;
}

bool config_init() {
    SPI.begin(TF_SCLK, TF_MISO, TF_MOSI, TF_CS);
    if (!SD.begin(TF_CS, SPI, 20000000)) {
        Serial.println("SD Card mount failed!");
        return false;
    }
    Serial.println("SD Card mounted.");

    lv_fs_drv_init(&drv);
    drv.letter = 'S';
    drv.open_cb = fs_open;
    drv.close_cb = fs_close;
    drv.read_cb = fs_read;
    drv.seek_cb = fs_seek;
    drv.tell_cb = fs_tell;
    lv_fs_drv_register(&drv);

    return config_load();
}
