#include "Arduino.h"
#include "SD.h"
#include "asset_transfer.h"
#include <ArduinoJson.h>
#include <cassert>
#include <iostream>
FakeSerial Serial;
FakeSD SD;
bool surface_ok() { return true; }
const char *surface_error() { return ""; }
size_t surface_bytes() { return 0; }
void reset() {
    SD = FakeSD{};
    SD.add("/macros.json", "{\"tiles\":[]}");
    Serial = FakeSerial{};
    fake_time = 0;
}
JsonDocument last_reply() {
    auto start = Serial.output.rfind("SYNC_UPLOAD:");
    assert(start != std::string::npos);
    JsonDocument d;
    assert(!deserializeJson(d, Serial.output.substr(start + 12)));
    return d;
}
int main() {
    reset();
    assert(handle_asset_command("GET_CAPABILITIES"));
    assert(Serial.output.find("\"upload_v2\":true") != std::string::npos);
    reset();
    Serial.input = {255, 216, 255};
    assert(handle_asset_command("FILE_BEGIN:/backgrounds/a.jpg:3"));
    assert(last_reply()["state"] == "done");
    assert(SD.nodes["/backgrounds/a.jpg"]->data == std::string("\xff\xd8\xff", 3));
    assert(Serial.output.find("\"state\":\"ready\"") < Serial.output.find("\"state\":\"done\""));
    for (const char *cmd :
         {"FILE_BEGIN:/macros.json:3", "FILE_BEGIN:/backgrounds/../bad.jpg:3",
          "FILE_BEGIN:/backgrounds/sub/a.jpg:3", "FILE_BEGIN:/backgrounds/a.jpg:0",
          "FILE_BEGIN:/backgrounds/a.jpg:524289", "FILE_BEGIN:/backgrounds/a.jpg:99999999999"}) {
        reset();
        Serial.input = {1, 2, 3};
        handle_asset_command(cmd);
        assert(last_reply()["state"] == "error" && Serial.input_pos == 0);
    }
    reset();
    SD.add("/backgrounds/a.jpg", "old");
    SD.add("/macros.json", "{\"theme\":{\"background_image\":\"/backgrounds/A.JPG\"}}");
    Serial.input = {1, 2, 3};
    handle_asset_command("FILE_BEGIN:/backgrounds/a.jpg:3");
    assert(last_reply()["state"] == "error" && Serial.input_pos == 0);
    assert(SD.nodes["/backgrounds/a.jpg"]->data == "old");
    reset();
    SD.add("/backgrounds/a.jpg", "old");
    Serial.input = {1, 2};
    handle_asset_command("FILE_BEGIN:/backgrounds/a.jpg:3");
    assert(last_reply()["state"] == "error");
    assert(SD.nodes["/backgrounds/a.jpg"]->data == "old");
    assert(!SD.exists("/backgrounds/a.jpg.uploading"));
    assert(!handle_asset_command("GET_JSON"));
    std::cout << "Prepared asset transfer tests passed: ready/done, raw bytes, bounds, path "
                 "guards, saved references and incomplete-transfer preservation.\n";
}
