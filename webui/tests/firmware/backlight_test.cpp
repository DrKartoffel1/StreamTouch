#include "Arduino.h"
#include "backlight.h"
#include <cassert>
#include <iostream>
FakeSerial Serial;
int main() {
    backlight::prepare();
    assert(lamp.pin == 2 && lamp.level == LOW);
    assert(backlight::set(83) && lamp.writes == 0);
    backlight::start();
    assert(backlight::available() && lamp.hz == 600 && lamp.bits == 8 && lamp.duty == 212);
    assert(backlight::frequency() == 600);
    unsigned previous = 0;
    for (unsigned percent = 10; percent <= 100; ++percent) {
        assert(backlight::set(percent));
        assert(lamp.duty > previous && lamp.duty >= 26 && lamp.duty <= 255);
        previous = lamp.duty;
    }
    assert(backlight::set(0) && lamp.duty == 26);
    assert(backlight::set(1000) && lamp.duty == 255);
    lamp.write_ok = false;
    assert(!backlight::set(83) && !backlight::available());
    assert(!lamp.attached && lamp.level == HIGH);
    assert(!backlight::set(50) && backlight::frequency() == 0);
    lamp.attach_ok = false;
    backlight::start();
    assert(!backlight::available() && lamp.level == HIGH);
    lamp.attach_ok = lamp.write_ok = true;
    backlight::start();
    assert(backlight::available() && lamp.duty == 255);
    std::cout << "Backlight tests passed: vendor600Hz, saved83%, monotonic10-100%, bounds and "
                 "visible attach/write fallbacks.\n";
}
