#pragma once
#include <cstdlib>
// Capture only the unused top/bottom margins, never an ordinary macro press.
class EdgeGesture {
  public:
    bool feed(bool pressed, int x, int y, bool settings) {
        if (pressed && !down_) {
            captured_ = settings ? y >= 450 : y < 30;
            origin_x_ = x;
            origin_y_ = y;
            direction_ = settings ? -1 : 1;
            distance_ = lateral_ = 0;
        }
        bool consume = captured_;
        if (pressed && captured_) {
            distance_ = direction_ * (y - origin_y_);
            lateral_ = std::abs(x - origin_x_);
        }
        if (!pressed && down_ && captured_) {
            toggle_ = distance_ >= 70 && distance_ > lateral_ * 2;
            captured_ = false;
        }
        down_ = pressed;
        return consume;
    }
    bool take_toggle() {
        bool result = toggle_;
        toggle_ = false;
        return result;
    }
    void reset() { down_ = captured_ = toggle_ = false; }

  private:
    bool down_ = false, captured_ = false, toggle_ = false;
    int origin_x_ = 0, origin_y_ = 0, direction_ = 1, distance_ = 0, lateral_ = 0;
};
