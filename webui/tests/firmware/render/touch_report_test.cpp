#include "touch_report.h"
#include <cstdio>
#include <cstdlib>
static void require(bool condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "FAIL: %s\n", message);
        exit(1);
    }
}
int main() {
    TouchReport state;
    uint8_t press[] = {0x81, 0, 0x34, 0x01, 0x56, 0, 0, 0, 0};
    uint8_t stale[] = {0};
    uint8_t release[] = {0x80};
    require(state.update(press, sizeof(press)) && state.pressed && state.x == 308 && state.y == 86,
            "fresh press coordinates preserve inverted/raw device orientation");
    for (int i = 0; i < 100; ++i)
        require(!state.update(stale, 1) && state.pressed,
                "no new controller data must not invent a release");
    require(!state.update(press, 4) && state.pressed, "short packet preserves previous state");
    press[0] = 0x8f;
    require(!state.update(press, 9) && state.pressed, "invalid contact count rejected");
    press[0] = 0x81;
    press[3] = 0xff;
    require(!state.update(press, 9), "out of range coordinates rejected");
    press[3] = 1;
    require(state.update(release, 1) && !state.pressed, "fresh zero-contact packet releases");
    int edges = 0;
    for (int i = 0; i < 20; ++i) {
        bool previous = state.pressed;
        state.update(press, 9);
        edges += state.pressed != previous;
        for (int j = 0; j < 3; ++j)
            state.update(stale, 1);
        previous = state.pressed;
        state.update(release, 1);
        edges += state.pressed != previous;
    }
    require(edges == 40 && !state.pressed, "rapid cycles yield exactly one press and release each");
    puts("PASS: fresh/stale GT911 reports, partial/malformed input and 20 rapid tap cycles");
}
