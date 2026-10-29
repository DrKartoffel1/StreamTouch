#include "edge_gesture.h"
#include "hold_repeat.h"
#include <cassert>
#include <iostream>
int main() {
    HoldRepeat hold;
    hold.press(0, false);
    assert(!hold.poll(5000));
    assert(!hold.release());
    hold.press(0xfffffff0, true);
    assert(!hold.poll(uint32_t(0xfffffff0 + 449u)));
    assert(hold.poll(uint32_t(0xfffffff0 + 450u)));
    assert(!hold.poll(uint32_t(0xfffffff0 + 599u)));
    assert(hold.poll(uint32_t(0xfffffff0 + 600u)));
    assert(hold.release());
    assert(!hold.poll(50000));
    hold.press(0, true);
    hold.cancel();
    assert(!hold.poll(50000));
    EdgeGesture edge;
    assert(!edge.feed(true, 100, 100, false));
    assert(!edge.feed(true, 100, 300, false));
    edge.feed(false, 100, 300, false);
    assert(!edge.take_toggle());
    edge.feed(true, 100, 10, false);
    edge.feed(true, 300, 120, false);
    edge.feed(false, 300, 120, false);
    assert(!edge.take_toggle());
    edge.feed(true, 100, 10, false);
    edge.feed(true, 100, 79, false);
    edge.feed(false, 100, 79, false);
    assert(!edge.take_toggle());
    edge.feed(true, 100, 10, false);
    edge.feed(true, 110, 100, false);
    edge.feed(false, 110, 100, false);
    assert(edge.take_toggle());
    assert(!edge.take_toggle());
    edge.feed(true, 100, 470, true);
    edge.feed(true, 100, 350, true);
    edge.feed(false, 100, 350, true);
    assert(edge.take_toggle());
    std::cout << "Interaction tests passed: opt-in repeat, tick wraparound, cancel, "
                 "edge/direction/threshold isolation.\n";
}
