"""Render actual firmware UI with installed LVGL; verify JPEG colors and press clipping.
Requires CMake, a C/C++ compiler and installed PlatformIO firmware dependencies.
No serial port, display server, Python imaging library or hardware is needed.
"""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / 'webui/tests/firmware/render'
build = root / '.pio/native-render'
subprocess.run(['cmake', '-S', str(source), '-B', str(build),
                '-DSTREAMTOUCH_ROOT=' + str(root)], check=True)
subprocess.run(['cmake', '--build', str(build), '--target', 'render_test', 'display_frames_test', 'touch_report_test', '-j', '4'], check=True)
subprocess.run([str(build / 'render_test'), str(source / 'colors.jpg'), str(source / 'icon-512.png'),
                *[str(source / ('icon-edge-' + shape + '.png')) for shape in ['round', 'point', 'opaque']],
                *sys.argv[1:]], check=True)
subprocess.run([str(build / 'display_frames_test')], check=True)
subprocess.run([str(build / 'touch_report_test')], check=True)
