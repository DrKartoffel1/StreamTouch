#pragma once
#include <cstdint>
void device_settings_init();
uint8_t device_brightness();
bool device_set_brightness(uint8_t percent, bool persist);
void device_restart();
void device_print_status();
const char *device_settings_error();
