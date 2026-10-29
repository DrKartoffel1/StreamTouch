#pragma once
namespace backlight {
void prepare();
void start();
bool set(unsigned percent);
bool available();
unsigned frequency();
} // namespace backlight
