#ifndef BLE_MACROPAD_H
#define BLE_MACROPAD_H

#include <Arduino.h>
#include <vector>

void ble_init();
void ble_loop();
void ble_send_keys(const std::vector<uint16_t>& keys, const std::vector<uint16_t>& media_keys);

#endif // BLE_MACROPAD_H
