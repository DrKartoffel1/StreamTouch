#pragma once
#include <cstdint>

// A slow frame never queues a burst of missed actions.
class HoldRepeat {
  public:
    void press(uint32_t now, bool enabled) {
        active_ = enabled;
        repeated_ = false;
        last_ = now;
    }
    bool poll(uint32_t now) {
        if (!active_ || uint32_t(now - last_) < (repeated_ ? 150u : 450u))
            return false;
        repeated_ = true;
        last_ = now;
        return true;
    }
    bool release() {
        active_ = false;
        return repeated_;
    }
    void cancel() {
        active_ = false;
        repeated_ = true;
    }

  private:
    bool active_ = false, repeated_ = false;
    uint32_t last_ = 0;
};
