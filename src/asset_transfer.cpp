#include "asset_transfer.h"
#include "file_store.h"
#include "surface.h"
#include <ArduinoJson.h>
#include <SD.h>

namespace {
void reply(const char *prefix, JsonDocument &doc) {
    Serial.print(prefix);
    serializeJson(doc, Serial);
    Serial.print('\n');
}
bool path_allowed(const String &path) {
    if (path.length() > 160 || path.indexOf("..") >= 0)
        return false;
    bool bg = path.startsWith("/backgrounds/") && path.endsWith(".jpg");
    bool icon = path.startsWith("/icons/") && path.endsWith(".png");
    if (!bg && !icon)
        return false;
    int start = bg ? 13 : 7;
    if (start >= (int)path.length())
        return false;
    for (int i = start; i < (int)path.length(); ++i) {
        char c = path[i];
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '.' || c == '-' || c == '_'))
            return false;
    }
    return true;
}
bool protected_file(const String &path) {
    recover_stored_file(path);
    if (SD.exists((path + ".previous").c_str())) return true;
    if (!SD.exists(path.c_str()))
        return false;
    File config = SD.open("/macros.json", FILE_READ);
    if (!config)
        return true;
    JsonDocument doc;
    auto error = deserializeJson(doc, config);
    config.close();
    if (error)
        return true;
    // Searching serialized JSON conservatively also protects preset references.
    String content;
    serializeJson(doc, content);
    content.toLowerCase();
    String target = path;
    target.toLowerCase();
    return content.indexOf(target) >= 0;
}
void upload(const String &command) {
    int colon = command.lastIndexOf(':');
    String path = command.substring(11, colon);
    String size_text = command.substring(colon + 1);
    uint32_t size = size_text.toInt();
    JsonDocument response;
    response["path"] = path;
    response["state"] = "error";
    bool digits = size_text.length() > 0 && size_text.length() <= 6;
    for (size_t i = 0; i < size_text.length(); ++i)
        if (size_text[i] < '0' || size_text[i] > '9')
            digits = false;
    if (colon <= 11 || !digits || size == 0 || size > 512 * 1024 || !path_allowed(path)) {
        response["error"] = "Invalid upload path or size (max 512 KiB)";
        reply("SYNC_UPLOAD:", response);
        return;
    }
    if (protected_file(path)) {
        response["error"] = "Cannot overwrite a referenced asset";
        reply("SYNC_UPLOAD:", response);
        return;
    }
    SD.mkdir(path.startsWith("/backgrounds/") ? "/backgrounds" : "/icons");
    String temporary = path + ".uploading";
    if (SD.exists(temporary.c_str()) && !SD.remove(temporary.c_str())) {
        response["error"] = "Cannot clear incomplete asset";
        reply("SYNC_UPLOAD:", response);
        return;
    }
    File file = SD.open(temporary.c_str(), FILE_WRITE);
    if (!file) {
        response["error"] = "Cannot create temporary asset";
        reply("SYNC_UPLOAD:", response);
        return;
    }
    response["state"] = "ready";
    reply("SYNC_UPLOAD:", response);
    uint32_t received = 0, started = millis(), last_data = started;
    bool write_ok = true;
    uint8_t buffer[512];
    // The old FILE command has a five-second total deadline. Prepared screen
    // images need a bounded but longer transaction, with a separate idle timeout.
    while (received < size && millis() - started < 120000 && millis() - last_data < 10000) {
        size_t count =
            min((uint32_t)sizeof(buffer), min(size - received, (uint32_t)Serial.available()));
        if (!count) {
            delay(1);
            continue;
        }
        count = Serial.readBytes(buffer, count);
        if (file.write(buffer, count) != count)
            write_ok = false;
        received += count;
        last_data = millis();
    }
    file.close();
    response["bytes"] = received;
    if (received != size || !write_ok) {
        SD.remove(temporary.c_str());
        response["state"] = "error";
        response["error"] = "Incomplete transfer; previous asset preserved";
    } else {
        String commit_error;
        if (!commit_staged_file(temporary, path, commit_error)) {
            SD.remove(temporary.c_str());
            response["state"] = "error";
            response["error"] = commit_error;
        } else
            response["state"] = "done";
    }
    reply("SYNC_UPLOAD:", response);
}
} // namespace
bool handle_asset_command(const String &command) {
    if (command == "GET_CAPABILITIES") {
        JsonDocument doc;
        doc["cached_backgrounds"] = true;
        doc["upload_v2"] = true;
        doc["max_file_size"] = 512 * 1024;
        reply("SYNC_CAPS:", doc);
        return true;
    }
    if (command == "GET_RENDER_STATUS") {
        JsonDocument doc;
        doc["ok"] = surface_ok();
        doc["error"] = surface_error();
        doc["surface_bytes"] = surface_bytes();
        doc["free_psram"] = ESP.getFreePsram();
        reply("SYNC_RENDER:", doc);
        return true;
    }
    if (command.startsWith("FILE_BEGIN:")) {
        upload(command);
        return true;
    }
    return false;
}
