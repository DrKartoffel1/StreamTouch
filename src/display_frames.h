#pragma once
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>

// LVGL may flush a refresh in many strips. Never expose those strips to scanout.
class DisplayFrames {
  public:
    static constexpr int Width = 800, Height = 480;
    static constexpr size_t Bytes = Width * Height * sizeof(uint16_t);
    void begin(uint16_t *front, uint16_t *back) {
        front_ = front;
        back_ = back;
        std::memset(front_, 0, Bytes);
        std::memset(back_, 0, Bytes);
    }
    void stage(int x1, int y1, int x2, int y2, const uint8_t *pixels, size_t stride) {
        assert(x1 >= 0 && y1 >= 0 && x2 < Width && y2 < Height && x1 <= x2 && y1 <= y2);
        size_t bytes = (x2 - x1 + 1) * sizeof(uint16_t);
        for (int y = y1; y <= y2; ++y, pixels += stride)
            std::memcpy(back_ + y * Width + x1, pixels, bytes);
        left_ = std::min(left_, x1);
        top_ = std::min(top_, y1);
        right_ = std::max(right_, x2);
        bottom_ = std::max(bottom_, y2);
    }
    const uint16_t *front() const { return front_; }
    uint16_t *pending() const { return back_; }
    // Before DMA starts, populate both buffers without changing the driver's initial fb0.
    void seed_front() { synchronize(back_, front_); }
    // Navigation overwrites the entire next frame. Its buffers need not mirror
    // each other until the mandatory full LVGL refresh when navigation ends.
    void presented_full_frame() {
        std::swap(front_, back_);
        left_ = Width;
        top_ = Height;
        right_ = bottom_ = -1;
    }
    // Call ONLY after the driver has latched pending() and released the old front.
    void presented() {
        std::swap(front_, back_);
        synchronize(front_, back_);
    }

  private:
    uint16_t *front_ = nullptr, *back_ = nullptr;
    int left_ = Width, top_ = Height, right_ = -1, bottom_ = -1;
    void synchronize(const uint16_t *source, uint16_t *destination) {
        for (int y = top_; y <= bottom_; ++y)
            std::memcpy(destination + y * Width + left_, source + y * Width + left_,
                        (right_ - left_ + 1) * sizeof(uint16_t));
        left_ = Width;
        top_ = Height;
        right_ = bottom_ = -1;
    }
};
