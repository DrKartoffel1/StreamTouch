#include "backlight.h"
#include <Arduino.h>

namespace {
constexpr unsigned Pin = 2;
// JC8048W550's supplied SD/blink demo uses 600Hz, 8-bit PWM for its LED driver.
// A valid ESP32 waveform at 20kHz did not produce usable physical dimming.
constexpr unsigned Frequency = 600;
constexpr unsigned Resolution = 8;
bool started = false, pwm = false;
unsigned brightness = 100;
unsigned duty(unsigned percent) { return (percent * 255 + 50) / 100; }
void fallback() {
    if (pwm)
        ledcDetach(Pin);
    pwm = false;
    pinMode(Pin, OUTPUT);
    digitalWrite(Pin, HIGH);
    Serial.println("[Backlight] PWM unavailable; using full brightness");
}
} // namespace
namespace backlight {
void prepare() {
    pinMode(Pin, OUTPUT);
    digitalWrite(Pin, LOW);
}
void start() {
    started = true;
    pwm = ledcAttach(Pin, Frequency, Resolution);
    if (!pwm || !ledcWrite(Pin, duty(brightness)))
        fallback();
}
bool set(unsigned percent) {
    percent = constrain(percent, 10u, 100u);
    if (started) {
        if (!pwm)
            return false;
        if (!ledcWrite(Pin, duty(percent))) {
            fallback();
            return false;
        }
    }
    brightness = percent;
    return true;
}
bool available() { return pwm; }
unsigned frequency() { return pwm ? ledcReadFreq(Pin) : 0; }
} // namespace backlight
