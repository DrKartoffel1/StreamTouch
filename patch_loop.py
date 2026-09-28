import sys
with open('src/display.cpp', 'r') as f:
    content = f.read()

replacement = """
void display_loop() {
    static uint32_t last_tick = 0;
    uint32_t current_tick = millis();
    lv_tick_inc(current_tick - last_tick);
    last_tick = current_tick;
    lv_timer_handler();
}
"""
content = content.replace("void display_loop() {\n    lv_timer_handler();\n    lv_tick_inc(5);\n}", replacement.strip())

with open('src/display.cpp', 'w') as f:
    f.write(content)
