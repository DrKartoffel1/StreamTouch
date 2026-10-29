#include "icon_store.h"
#include <ArduinoJson.h>
#include <SD.h>

namespace {
// Restrict destructive operations to PNGs in /icons, not arbitrary SD files.
bool valid_icon_path(const String &path) {
    if (!path.startsWith("/icons/") || path.endsWith("/"))
        return false;
    String lower = path;
    lower.toLowerCase();
    if (!lower.endsWith(".png"))
        return false;
    for (size_t i = 0; i < path.length(); ++i) {
        unsigned char c = path[i];
        if (c < 32 || c == 127 || c == ':' || c == '\\')
            return false;
    }
    int start = 1;
    while (start < (int)path.length()) {
        int end = path.indexOf('/', start);
        if (end < 0)
            end = path.length();
        String segment = path.substring(start, end);
        if (segment == "." || segment == ".." || segment.length() == 0)
            return false;
        start = end + 1;
    }
    return true;
}

String normalized_icon(String path) {
    if (path.startsWith("S:"))
        path = path.substring(2);
    String normalized;
    int start = 0;
    while (start < (int)path.length()) {
        int end = path.indexOf('/', start);
        if (end < 0)
            end = path.length();
        String segment = path.substring(start, end);
        if (segment == "..") {
            int slash = normalized.lastIndexOf('/');
            normalized = slash >= 0 ? normalized.substring(0, slash) : String("");
        } else if (segment.length() && segment != ".")
            normalized += "/" + segment;
        start = end + 1;
    }
    // FAT paths are case insensitive; protect relative and dot-segment aliases.
    normalized.toLowerCase();
    return normalized;
}

bool read_saved_config(JsonDocument &doc) {
    if (!SD.exists("/macros.json"))
        return true;
    File file = SD.open("/macros.json", FILE_READ);
    if (!file)
        return false;
    DeserializationError error = deserializeJson(doc, file);
    file.close();
    if (error || !doc.is<JsonObject>() || (!doc["tiles"].isNull() && !doc["tiles"].is<JsonArray>()))
        return false;
    for (JsonVariantConst tile : doc["tiles"].as<JsonArrayConst>()) {
        if (!tile.is<JsonObjectConst>() ||
            (!tile["icon"].isNull() && !tile["icon"].is<const char *>()))
            return false;
    }
    return true;
}

bool referenced(const JsonDocument &config, const String &path) {
    String normalized = normalized_icon(path);
    for (JsonObjectConst tile : config["tiles"].as<JsonArrayConst>()) {
        if (tile["icon"].is<const char *>() &&
            normalized_icon(tile["icon"].as<String>()) == normalized)
            return true;
    }
    return false;
}

bool list_directory(const String &path, JsonArray files, const JsonDocument &config,
                    unsigned depth) {
    if (depth > 8)
        return false;
    File dir = SD.open(path.c_str());
    if (!dir || !dir.isDirectory()) {
        dir.close();
        return false;
    }
    File entry = dir.openNextFile();
    bool ok = true;
    while (entry) {
        String name = entry.name();
        // Arduino FS implementations may return a basename or a full path.
        int slash = name.lastIndexOf('/');
        if (slash >= 0)
            name = name.substring(slash + 1);
        String full = path + "/" + name;
        if (entry.isDirectory()) {
            if (!list_directory(full, files, config, depth + 1))
                ok = false;
        } else if (valid_icon_path(full)) {
            // Fail visibly rather than return a silently incomplete library.
            if (files.size() >= 1024) {
                ok = false;
                entry.close();
                break;
            }
            JsonObject item = files.add<JsonObject>();
            item["path"] = full;
            item["size"] = entry.size();
            item["in_use"] = referenced(config, full);
        }
        entry.close();
        entry = dir.openNextFile();
    }
    dir.close();
    return ok;
}

void reply(const char *prefix, JsonDocument &doc) {
    Serial.print(prefix);
    serializeJson(doc, Serial);
    Serial.print('\n');
}
} // namespace

bool handle_icon_command(const String &command) {
    if (command == "LIST_ICONS") {
        JsonDocument response, config;
        response["version"] = 1;
        JsonArray files = response["files"].to<JsonArray>();
        if (!SD.cardType())
            response["error"] = "SD card unavailable";
        else if (!read_saved_config(config))
            response["error"] = "Cannot read saved configuration safely";
        else if (SD.exists("/icons") && !list_directory("/icons", files, config, 0))
            response["error"] = "Cannot enumerate the complete icon library (limit: 1024 files, 8 "
                                "subdirectory levels)";
        reply("SYNC_ICONS:", response);
        return true;
    }
    if (command.startsWith("DELETE_ICON:")) {
        String path = command.substring(12);
        JsonDocument response, config;
        response["path"] = path;
        response["ok"] = false;
        if (!valid_icon_path(path))
            response["error"] = "Invalid icon path";
        else if (!read_saved_config(config))
            response["error"] = "Cannot read saved configuration safely";
        else if (referenced(config, path))
            response["error"] = "Icon is referenced by the saved configuration";
        else if (!SD.exists(path.c_str()))
            response["error"] = "Icon no longer exists";
        else if (!SD.remove(path.c_str()))
            response["error"] = "SD card refused deletion";
        else
            response["ok"] = !SD.exists(path.c_str());
        reply("ICON_DELETED:", response);
        return true;
    }
    return false;
}
