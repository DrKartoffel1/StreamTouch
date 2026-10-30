#pragma once
#include <cstdint>
#include <chrono>
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

inline uint32_t micros() {
    return uint32_t(std::chrono::duration_cast<std::chrono::microseconds>(
                        std::chrono::steady_clock::now().time_since_epoch())
                        .count());
}
