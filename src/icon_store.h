#pragma once
#include <Arduino.h>

// Only handles explicit library operations; never changes macros or UI layout.
bool handle_icon_command(const String &command);
