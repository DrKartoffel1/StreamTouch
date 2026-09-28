import sys

with open('src/config.cpp', 'r') as f:
    content = f.read()

# We want to replace the `for (JsonObject btn : buttons) {` block
replacement = """
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
                    if (type == "keys") {
                        JsonArray keys = a["keys"];
                        if (!keys.isNull()) {
                            for (JsonVariant v : keys) {
                                String name = v.as<String>();
                                name.trim();
                                name.toUpperCase();
                                
                                uint16_t mcode = 0;
                                if (name == "NEXT" || name == "NEXT_TRACK" || name == "MEDIA_NEXT" || name == "MEDIA_NEXT_TRACK") mcode = 1;
                                else if (name == "PREV" || name == "PREVIOUS" || name == "PREVIOUS_TRACK" || name == "MEDIA_PREV" || name == "MEDIA_PREVIOUS_TRACK") mcode = 2;
                                else if (name == "PLAY" || name == "PLAY_PAUSE" || name == "PLAYPAUSE" || name == "MEDIA_PLAY" || name == "MEDIA_PLAY_PAUSE") mcode = 8;
                                else if (name == "MUTE" || name == "MEDIA_MUTE") mcode = 16;
                                else if (name == "VOL_UP" || name == "VOLUME_UP" || name == "MEDIA_VOL_UP" || name == "MEDIA_VOLUME_UP") mcode = 32;
                                else if (name == "VOL_DOWN" || name == "VOLUME_DOWN" || name == "MEDIA_VOL_DOWN" || name == "MEDIA_VOLUME_DOWN") mcode = 64;
                                
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
                                else if (name.length() == 1) {
                                    code = name.charAt(0);
                                    if (code >= 'A' && code <= 'Z') code = code - 'A' + 'a'; // BleKeyboard expects lowercase for standard letters
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
"""

start_idx = content.find('JsonArray buttons = doc["tiles"];')
if start_idx == -1:
    start_idx = content.find('JsonArray buttons = doc["buttons"];')

if start_idx != -1:
    content = content[:start_idx] + replacement.strip() + "\n"

with open('src/config.cpp', 'w') as f:
    f.write(content)
