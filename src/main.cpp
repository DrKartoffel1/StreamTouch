#include <Arduino.h>
#include "display.h"
#include "config.h"
#include "ui.h"
#include "ble_macropad.h"
#include "serial_config.h"

void setup() {
    Serial.setRxBufferSize(4096);
    Serial.begin(115200);
    Serial.println("Starting StreamTouch3 (Modern)");
    
    Serial.println("Booting into Normal Mode");
    display_init(true);
    config_init();
    ble_init();
    ui_init();
}

void loop() {
    display_loop();
    ble_loop();
    serial_loop();
    delay(5);
}
