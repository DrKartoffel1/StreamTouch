#pragma once
#include <cstddef>
#include <cstdint>

// Scene IDs are tile pages 0..7 and settings 8. Reset after configuration changes.
void navigation_capture(int scene);
bool navigation_start(int from, int to, int horizontal, int vertical, void (*completed)());
void navigation_reset();
bool navigation_active();
bool navigation_blur();
size_t navigation_bytes();
void navigation_record_frame(uint32_t render_us);
unsigned navigation_frames();
uint32_t navigation_max_frame_us();
