import sys
with open('src/display.cpp', 'r') as f:
    content = f.read()

replacement = """
static void lv_touch_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {
    touch.read();
    if (touch.isTouched) {
        data->state = LV_INDEV_STATE_PRESSED;
        data->point.x = touch.points[0].x;
        data->point.y = touch.points[0].y;
        Serial.printf("Touch: %d, %d\\n", data->point.x, data->point.y);
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}
"""
content = content.replace("static void lv_touch_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {\n    touch.read();\n    if (touch.isTouched) {\n        data->state = LV_INDEV_STATE_PRESSED;\n        data->point.x = touch.points[0].x;\n        data->point.y = touch.points[0].y;\n    } else {\n        data->state = LV_INDEV_STATE_RELEASED;\n    }\n}", replacement.strip())

with open('src/display.cpp', 'w') as f:
    f.write(content)
