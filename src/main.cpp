#include <Arduino.h>
#include "display.h"
#include "config.h"
#include "ui.h"
#include "ble_macropad.h"
#include "serial_config.h"
#include "device_settings.h"

// PNG decoding and software-render diagnostics have a deeper call stack than input polling.
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

void setup() {
    Serial.setRxBufferSize(4096);
    Serial.begin(115200);
    Serial.println("Starting StreamTouch3");
    
    display_init(true);
    config_init();
    device_settings_init();
    ui_init();
    display_start();
}

void loop() {
    display_loop();
    ble_loop();
    ui_loop();
    serial_loop();
    delay(1);
}
