#include "Arduino.h"
#include "SD.h"
#include "icon_store.h"
#include <ArduinoJson.h>
#include <cassert>
#include <iostream>
FakeSerial Serial;
FakeSD SD;
void reset(const char *json = "{\"tiles\":[{\"icon\":\"S:/icons/USED.png\"}]}") {
    SD = FakeSD{};
    SD.add("/macros.json", json);
    SD.add("/icons/used.png", "used");
    SD.add("/icons/sub/unused.png", "unused");
    Serial.output.clear();
}
JsonDocument command(const char *cmd, const char *prefix) {
    Serial.output.clear();
    assert(handle_icon_command(String(cmd)));
    assert(Serial.output.rfind(prefix, 0) == 0);
    JsonDocument result;
    assert(!deserializeJson(result, Serial.output.substr(std::string(prefix).size())));
    return result;
}
int main() {
    reset();
    auto list = command("LIST_ICONS", "SYNC_ICONS:");
    if (list["files"].size() != 2)
        std::cerr << Serial.output;
    assert(list["files"].size() == 2);
    bool protectedFile = false;
    for (JsonObject f : list["files"].as<JsonArray>())
        if (f["path"] == "/icons/used.png")
            protectedFile = f["in_use"];
    assert(protectedFile);
    auto used = command("DELETE_ICON:/icons/used.png", "ICON_DELETED:");
    assert(!used["ok"].as<bool>() && SD.removals.empty());
    auto removed = command("DELETE_ICON:/icons/sub/unused.png", "ICON_DELETED:");
    assert(removed["ok"].as<bool>() && !SD.exists("/icons/sub/unused.png"));
    assert(SD.exists("/icons/used.png"));
    for (const char *path : {"DELETE_ICON:/macros.json", "DELETE_ICON:/icons/../macros.json",
                             "DELETE_ICON:/icons//used.png", "DELETE_ICON:/icons/./used.png",
                             "DELETE_ICON:/icons/used.png\nGET_JSON"}) {
        auto reply = command(path, "ICON_DELETED:");
        assert(!reply["ok"].as<bool>());
    }
    assert(SD.removals.size() == 1);
    reset("{\"tiles\":[{\"icon\":\"icons/sub/../USED.png\"}]}");
    assert(!command("DELETE_ICON:/icons/used.png", "ICON_DELETED:")["ok"].as<bool>());
    reset("corrupt json");
    assert(!command("DELETE_ICON:/icons/used.png", "ICON_DELETED:")["ok"].as<bool>() &&
           SD.removals.empty());
    assert(command("LIST_ICONS", "SYNC_ICONS:")["error"].is<const char *>());
    reset("{\"tiles\":[null]}");
    assert(!command("DELETE_ICON:/icons/used.png", "ICON_DELETED:")["ok"].as<bool>() &&
           SD.removals.empty());
    reset();
    SD.refuse = true;
    assert(!command("DELETE_ICON:/icons/sub/unused.png", "ICON_DELETED:")["ok"].as<bool>() &&
           SD.exists("/icons/sub/unused.png"));
    reset();
    SD.available = false;
    assert(command("LIST_ICONS", "SYNC_ICONS:")["error"].is<const char *>());
    assert(!handle_icon_command("GET_JSON"));
    std::cout << "Firmware icon-store tests passed: enumeration, saved/dot/case references, path "
                 "rejection, corrupt config, deletion, SD refusal and unavailable card.\n";
}
