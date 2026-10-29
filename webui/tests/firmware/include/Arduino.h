#pragma once
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>
class String : public std::string {
  public:
    using std::string::string;
    String(const std::string &s) : std::string(s) {}
    String(const char *s) : std::string(s ? s : "") {}
    String &operator=(const char *s) {
        std::string::operator=(s ? s : "");
        return *this;
    }
    bool startsWith(const char *s) const { return rfind(s, 0) == 0; }
    bool endsWith(const char *s) const {
        std::string suffix(s);
        return size() >= suffix.size() &&
               compare(size() - suffix.size(), suffix.size(), suffix) == 0;
    }
    int indexOf(const String &s) const {
        auto p = find(s);
        return p == npos ? -1 : int(p);
    }
    long toInt() const {
        try {
            return std::stol(*this);
        } catch (...) {
            return 0;
        }
    }
    int indexOf(char c, int start = 0) const {
        auto p = find(c, start);
        return p == npos ? -1 : int(p);
    }
    int lastIndexOf(char c) const {
        auto p = rfind(c);
        return p == npos ? -1 : int(p);
    }
    String substring(int start) const { return substr(start); }
    String substring(int start, int end) const { return substr(start, end - start); }
    void toLowerCase() {
        std::transform(begin(), end(), begin(), [](unsigned char c) { return std::tolower(c); });
    }
    bool reserve(size_t count) {
        std::string::reserve(count);
        return true;
    }
    bool concat(char c) {
        push_back(c);
        return true;
    }
    void trim() {
        auto first = find_first_not_of(" \t\r\n");
        if (first == npos) {
            clear();
            return;
        }
        auto last = find_last_not_of(" \t\r\n");
        *this = substr(first, last - first + 1);
    }
    bool concat(const char *s) {
        append(s);
        return true;
    }
};
struct FakeSerial {
    std::string output;
    std::vector<uint8_t> input;
    size_t input_pos = 0;
    size_t available() const { return input.size() - input_pos; }
    size_t readBytes(uint8_t *buffer, size_t count) {
        count = std::min(count, available());
        std::copy_n(input.data() + input_pos, count, buffer);
        input_pos += count;
        return count;
    }

    template <typename... Args> void printf(const char *format, Args... args) {
        char buffer[512];
        std::snprintf(buffer, sizeof(buffer), format, args...);
        output += buffer;
    }
    void print(const char *s) { output += s; }
    void print(const String &s) { output += s; }
    void print(char c) { output += c; }
    void print(size_t value) { output += std::to_string(value); }
    void println(const String &s) {
        output += s;
        output += '\n';
    }
    int read() { return available() ? input[input_pos++] : -1; }
    size_t write(uint8_t c) {
        output += char(c);
        return 1;
    }
    size_t write(const uint8_t *s, size_t n) {
        output.append(reinterpret_cast<const char *>(s), n);
        return n;
    }
};
extern FakeSerial Serial;
inline uint32_t fake_time = 0;
inline uint32_t millis() { return fake_time++; }
inline void delay(unsigned n) { fake_time += n; }
using std::min;
template <typename T, typename L, typename H> T constrain(T value, L low, H high) {
    return std::max(T(low), std::min(value, T(high)));
}
struct FakeESP {
    unsigned restarts = 0;
    void restart() { ++restarts; }
    uint32_t getFreePsram() const { return 4000000; }
};
inline FakeESP ESP;

// Test-only Arduino LEDC/GPIO adapter used by the actual backlight module.
inline constexpr int OUTPUT = 1, HIGH = 1, LOW = 0;
struct BacklightHardware {
    bool attach_ok = true, write_ok = true, attached = false;
    unsigned pin = 0, hz = 0, bits = 0, duty = 0, level = 0, writes = 0;
};
inline BacklightHardware lamp;
inline void pinMode(unsigned pin, int) { lamp.pin = pin; }
inline void digitalWrite(unsigned pin, int level) { lamp.pin = pin; lamp.level = level; }
inline bool ledcAttach(unsigned pin, unsigned hz, unsigned bits) {
    lamp.pin = pin; lamp.hz = hz; lamp.bits = bits;
    return lamp.attached = lamp.attach_ok;
}
inline bool ledcWrite(unsigned pin, unsigned duty) {
    if (pin != lamp.pin || !lamp.attached || !lamp.write_ok) return false;
    lamp.duty = duty; ++lamp.writes; return true;
}
inline bool ledcDetach(unsigned) { lamp.attached = false; return true; }
inline unsigned ledcReadFreq(unsigned) { return lamp.hz; }
