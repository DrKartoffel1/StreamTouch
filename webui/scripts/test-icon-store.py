"""Run firmware handlers against in-memory SD, Serial and BLE adapters.

Requires g++ and the installed PlatformIO ArduinoJson dependency; no hardware.
"""

from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
web = root / "webui"
json_include = root / ".pio/libdeps/JC8048W550C/ArduinoJson/src"
if not json_include.is_dir():
    raise SystemExit("Install firmware dependencies with `pio pkg install` first.")

suites = {
    "backlight_test": ["backlight"],
    "interaction_test": [],
    "device_settings_test": ["device_settings"],
    "icon_store_test": ["icon_store"],
    "asset_transfer_test": ["asset_transfer", "file_store"],
    "ble_macropad_test": ["ble_macropad"],
    "file_store_test": ["file_store"],
    "serial_config_test": ["serial_config", "file_store"],
}
flags = [
    "-std=c++17",
    "-DARDUINOJSON_ENABLE_ARDUINO_STRING=1",
    "-DARDUINOJSON_ENABLE_ARDUINO_STREAM=0",
    "-DARDUINOJSON_ENABLE_ARDUINO_PRINT=0",
    "-DARDUINOJSON_ENABLE_PROGMEM=0",
    "-I" + str(web / "tests/firmware/include"),
    "-I" + str(json_include),
    "-I" + str(root / "src"),
]
with tempfile.TemporaryDirectory(prefix="streamtouch-handler-test-") as temporary:
    for name, sources in suites.items():
        binary = str(Path(temporary) / name)
        subprocess.run([
            "g++", *flags,
            str(web / f"tests/firmware/{name}.cpp"),
            *(str(root / f"src/{source}.cpp") for source in sources),
            "-o", binary,
        ], check=True)
        subprocess.run([binary], check=True)
