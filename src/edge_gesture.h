#pragma once
#include <cstdlib>
// Capture only unused screen margins, never an ordinary macro press.
class EdgeGesture {
  public:
    bool feed(bool pressed, int x, int y, bool settings) {
        if (pressed && !down_) {
            horizontal_ = !settings && y >= 30 && y < 450 && (x < 30 || x >= 770);
            captured_ = horizontal_ || (settings ? y >= 450 : y < 30);
            origin_x_ = x;
            origin_y_ = y;
            direction_ = horizontal_ ? (x < 30 ? 1 : -1) : (settings ? -1 : 1);
            distance_ = lateral_ = 0;
        }
        bool consume = captured_;
        if (pressed && captured_) {
            distance_ = direction_ * (horizontal_ ? x - origin_x_ : y - origin_y_);
            lateral_ = std::abs(horizontal_ ? y - origin_y_ : x - origin_x_);
        }
        if (!pressed && down_ && captured_) {
            if (distance_ >= 70 && distance_ > lateral_ * 2) {
                if (horizontal_)
                    page_ = -direction_;
                else
                    toggle_ = true;
            }
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
    int take_page() {
        int result = page_;
        page_ = 0;
        return result;
    }
    void reset() {
        down_ = captured_ = toggle_ = false;
        page_ = 0;
    }

  private:
    int page_ = 0;
    bool horizontal_ = false;
    bool down_ = false, captured_ = false, toggle_ = false;
    int origin_x_ = 0, origin_y_ = 0, direction_ = 1, distance_ = 0, lateral_ = 0;
};
