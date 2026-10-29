"""Rebuild the preview's bitmap font from the LVGL source used by the firmware.
Run from webui with python3 scripts/extract-device-font.py.
No font substitution, network download, or browser-specific font rasterization.
"""
from pathlib import Path
import base64
import hashlib
import json
import re

root = Path(__file__).resolve().parents[2]
source = root / '.pio/libdeps/JC8048W550C/lvgl/src/font/lv_font_montserrat_24.c'
text = source.read_text()

def numbers(name):
    body = re.search(r'\b' + name + r'\[\]\s*=\s*\{(.*?)\};', text, re.S).group(1)
    body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
    return [int(n, 0) for n in re.findall(r'-?0x[\da-fA-F]+|-?\d+', body)]

glyphs = re.findall(r'\{\.bitmap_index = (\d+), \.adv_w = (\d+), \.box_w = (\d+), \.box_h = (\d+), \.ofs_x = (-?\d+), \.ofs_y = (-?\d+)\}', text)
font = {
    'source': 'LVGL lv_font_montserrat_24.c; Montserrat Medium, 24px, 4bpp',
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'lineHeight': 27, 'baseline': 5,
    'bitmap': base64.b64encode(bytes(numbers('glyph_bitmap'))).decode(),
    'glyphs': [[int(n) for n in glyph] for glyph in glyphs],
    'codepoints': list(range(32,127)) + [176 + n for n in numbers('unicode_list_1')],
    'kernLeft': numbers('kern_left_class_mapping'),
    'kernRight': numbers('kern_right_class_mapping'),
    'kernValues': numbers('kern_class_values'),
    'kernRightCount': 49,
}
assert len(font['codepoints']) + 1 == len(font['glyphs'])
output = root / 'webui/src/assets/device-font.json'
output.write_text(json.dumps(font, separators=(',', ':')) + '\n')
license_source = root / '.pio/libdeps/JC8048W550C/lvgl/LICENCE.txt'
(root / 'webui/src/assets/LVGL-LICENSE.txt').write_text(license_source.read_text())
print(f'Extracted {len(font["codepoints"])} device glyphs into {output.name}')
