#include "Arduino.h"
#include "SD.h"
#include "serial_command.h"
#include "serial_config.h"
#include <cassert>
#include <iostream>
FakeSerial Serial;
FakeSD SD;
unsigned loads = 0, rebuilds = 0;
bool config_load() {
    ++loads;
    return true;
}
void ui_rebuild() { ++rebuilds; }
void device_print_status() { Serial.print("DEVICE\n"); }
void display_print_status() { Serial.print("DISPLAY\n"); }
bool handle_icon_command(const String &) { return false; }
std::vector<uint8_t> binary;
bool handle_asset_command(const String &command) {
    if (command == "FILE_BEGIN:/icons/raw.png:3") {
        binary.resize(3);
        assert(Serial.readBytes(binary.data(), 3) == 3);
        return true;
    }
    return false;
}
void feed(const std::string &text) {
    Serial.input.insert(Serial.input.end(), text.begin(), text.end());
}
void pump() {
    while (Serial.available())
        serial_loop();
}
int main() {
    SD.add("/macros.json", "{\"tiles\":[]}");
    feed("GET_J");
    serial_loop();
    assert(Serial.output.empty());
    feed("SON\r\n");
    pump();
    assert(Serial.output == "SYNC_JSON:{\"tiles\":[]}\n");
    Serial.output.clear();
    feed("GET_DISPLAY_STATUS\nGET_JSON\n");
    serial_loop();
    assert(Serial.output == "DISPLAY\n");
    serial_loop();
    assert(Serial.output.find("SYNC_JSON:") != std::string::npos);
    feed("JSON:{bad}\n");
    pump();
    assert(loads == 0 && rebuilds == 0 && SD.nodes["/macros.json"]->data == "{\"tiles\":[]}");
    feed("JSON:{\"tiles\":[],\"future\":{\"x\":1}}\n");
    pump();
    assert(loads == 1 && rebuilds == 1 &&
           SD.nodes["/macros.json"]->data.find("future") != std::string::npos);
    feed("FILE_BEGIN:/icons/raw.png:3\n");
    Serial.input.insert(Serial.input.end(), {'\n', 255, '\r'});
    feed("GET_JSON\n");
    serial_loop();
    assert((binary == std::vector<uint8_t>{'\n', 255, '\r'}));
    pump();
    SD.add("/icons/keep.png", "old");
    feed("FILE:/icons/keep.png:3\nAB");
    pump();
    assert(SD.nodes["/icons/keep.png"]->data == "old" &&
           Serial.output.find("FILE_ERROR:") != std::string::npos);
    feed("FILE:/icons/keep.png:3\nABC");
    pump();
    assert(SD.nodes["/icons/keep.png"]->data == "ABC");
    assert(Serial.output.find("FILE_OK") != std::string::npos);
    feed("GET_");
    pump();
    fake_time += 1500;
    Serial.output.clear();
    feed("GET_JSON\n");
    pump();
    assert(Serial.output.find("timed out") != std::string::npos &&
           Serial.output.find("SYNC_JSON:") != std::string::npos);
    SerialCommand command;
    String ready;
    for (size_t i = 0; i <= SerialCommand::MaximumBytes; ++i)
        command.push('x', ready);
    assert(command.push('\n', ready) == SerialCommand::Result::Rejected);
    command.push('A', ready);
    assert(command.push('\n', ready) == SerialCommand::Result::Ready && ready == "A");
    command.push('\0', ready);
    assert(command.push('\n', ready) == SerialCommand::Result::Rejected);
    std::cout << "Serial tests passed: fragmented/CRLF/batched text, binary ownership, invalid "
                 "JSON, legacy upload completion and bounded recovery.\n";
}
