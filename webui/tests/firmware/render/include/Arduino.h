#pragma once
#include <cstdint>
#include <string>
using String = std::string;
struct RenderSerial {
    template <typename... Args> void printf(const char *, Args...) {}
};
inline RenderSerial Serial;
struct RenderESP {
    unsigned getFreePsram() const { return 4000000; }
};
inline RenderESP ESP;
