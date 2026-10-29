cmake_minimum_required(VERSION 3.20)
project(streamtouch_render_tests C CXX)
set(CMAKE_CXX_STANDARD 17)
# Use the firmware's configuration and installed LVGL version, without a display backend.
configure_file("${STREAMTOUCH_ROOT}/include/lv_conf.h" "${CMAKE_BINARY_DIR}/lv_conf.h" COPYONLY)
set(LV_BUILD_CONF_PATH "${CMAKE_BINARY_DIR}/lv_conf.h" CACHE PATH "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG OFF CACHE BOOL "" FORCE)
add_subdirectory("${STREAMTOUCH_ROOT}/.pio/libdeps/JC8048W550C/lvgl" lvgl)
add_executable(render_test render_test.cpp "${STREAMTOUCH_ROOT}/src/ui.cpp" "${STREAMTOUCH_ROOT}/src/icon_cache.cpp")
target_include_directories(render_test PRIVATE include "${STREAMTOUCH_ROOT}/src")
# Firmware accepts integer part selectors; newer LVGL declares these as enums on hosts.
target_compile_options(render_test PRIVATE -fpermissive)
target_link_libraries(render_test PRIVATE lvgl m)

add_executable(display_frames_test display_frames_test.cpp)
target_include_directories(display_frames_test PRIVATE "${STREAMTOUCH_ROOT}/src")

add_executable(touch_report_test touch_report_test.cpp)
target_include_directories(touch_report_test PRIVATE "${STREAMTOUCH_ROOT}/src")
