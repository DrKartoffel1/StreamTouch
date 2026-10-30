#include "display_frames.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
static void require(bool condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "FAIL: %s\n", message);
        exit(1);
    }
}
int main() {
    constexpr int W = DisplayFrames::Width, H = DisplayFrames::Height;
    std::vector<uint16_t> a(W * H, 0xffff), b(W * H, 0xffff), expected(W * H);
    DisplayFrames frames;
    frames.begin(a.data(), b.data());
    require(a == expected && b == expected, "startup clears both framebuffers");
    for (int i = 0; i < W * H; ++i)
        expected[i] = uint16_t(i);
    frames.stage(0, 0, W - 1, H - 1, reinterpret_cast<uint8_t *>(expected.data()), W * 2);
    require(a[1000] == 0, "staged startup frame stays hidden");
    frames.seed_front();
    require(a == expected && b == expected, "startup seeds driver fb0 without swapping");
    uint16_t *front = a.data();
    for (int frame = 0; frame < 24; ++frame) {
        auto before = expected;
        // Disjoint areas and padded odd-width strips exercise partial refreshes and stride.
        for (int area = 0; area < 2; ++area) {
            int x = area ? W - 11 : 0, y = area ? H - 23 : 0;
            int width = 11, height = 23, stride = width + 1;
            std::vector<uint16_t> pixels(stride * height, 0xdead);
            for (int row = 0; row < height; ++row)
                for (int col = 0; col < width; ++col)
                    expected[(y + row) * W + x + col] = pixels[row * stride + col] =
                        uint16_t(0x1000 + frame * 32 + area);
            for (int row = 0; row < height; row += 3) {
                int rows = std::min(3, height - row);
                frames.stage(x, y + row, x + width - 1, y + row + rows - 1,
                             reinterpret_cast<uint8_t *>(pixels.data() + row * stride), stride * 2);
                require(std::equal(before.begin(), before.end(), front),
                        "scanout remains unchanged after every partial strip");
            }
        }
        auto *next = frames.pending();
        require(next != front && std::equal(expected.begin(), expected.end(), next),
                "publish only a completely assembled refresh");
        // Simulated frame-consumed acknowledgement: only now is old front writable.
        frames.presented();
        front = next;
        require(a == expected && b == expected,
                "released buffer keeps dirty regions synchronized without losing static content");
    }
    for (int frame = 0; frame < 5; ++frame) {
        auto before = expected;
        auto *hidden = frames.pending();
        std::fill(hidden, hidden + W * H, uint16_t(0x7770 + frame));
        require(std::equal(before.begin(), before.end(), frames.front()),
                "composing full navigation frame never changes scanout");
        frames.presented_full_frame();
        std::fill(expected.begin(), expected.end(), uint16_t(0x7770 + frame));
        require(frames.front() == hidden &&
                    std::equal(expected.begin(), expected.end(), frames.front()),
                "navigation publishes complete composed frame after acknowledgement");
    }
    std::fill(expected.begin(), expected.end(), uint16_t(0x1234));
    frames.stage(0, 0, W - 1, H - 1, reinterpret_cast<uint8_t *>(expected.data()), W * 2);
    frames.presented();
    require(a == expected && b == expected, "full refresh resynchronizes buffers after navigation");
    uint16_t patch = 0x5678;
    frames.stage(0, 0, 0, 0, reinterpret_cast<uint8_t *>(&patch), 2);
    frames.presented();
    expected[0] = patch;
    require(a == expected && b == expected,
            "ordinary partial updates remain correct after navigation");
    puts("PASS: atomic partial-frame staging, padded stride, startup and 24 alternating frame "
         "swaps");
}
