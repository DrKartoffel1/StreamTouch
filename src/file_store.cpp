#include "file_store.h"
#include "pages.h"
#include <ArduinoJson.h>
#include <SD.h>
#include <algorithm>
#include <cstring>

namespace {
struct JsonInput {
    const String &text;
    size_t offset = 0;
    int read() { return offset < text.length() ? uint8_t(text.c_str()[offset++]) : -1; }
    size_t readBytes(char *buffer, size_t count) {
        count = std::min(count, text.length() - offset);
        memcpy(buffer, text.c_str() + offset, count);
        offset += count;
        return count;
    }
};
} // namespace

bool recover_stored_file(const String &path) {
    if (SD.exists(path.c_str()))
        return true;
    String previous = path + ".previous";
    return SD.exists(previous.c_str()) && SD.rename(previous.c_str(), path.c_str());
}

bool commit_staged_file(const String &staged, const String &path, String &error) {
    File candidate = SD.open(staged.c_str(), FILE_READ);
    if (staged == path || !candidate || candidate.isDirectory()) {
        error = "Missing or invalid staged file";
        return false;
    }
    candidate.close();
    File target = SD.open(path.c_str(), FILE_READ);
    if (target && target.isDirectory()) {
        error = "Cannot replace a directory with a file";
        return false;
    }
    target.close();
    String previous = path + ".previous";
    if (!SD.exists(path.c_str()) && SD.exists(previous.c_str()) && !recover_stored_file(path)) {
        error = "Cannot recover the previous file";
        return false;
    }
    bool had_previous = SD.exists(path.c_str());
    if (had_previous) {
        if (SD.exists(previous.c_str()) && !SD.remove(previous.c_str())) {
            error = "Cannot clear the previous commit backup";
            return false;
        }
        if (!SD.rename(path.c_str(), previous.c_str())) {
            error = "Cannot preserve the previous file";
            return false;
        }
    }
    if (!SD.rename(staged.c_str(), path.c_str())) {
        bool restored = !had_previous || SD.rename(previous.c_str(), path.c_str());
        error = restored ? "Cannot commit the staged file; previous file preserved"
                         : "Cannot commit; previous file retained in .previous for recovery";
        return false;
    }
    // Failure to remove this redundant backup does not invalidate the committed file.
    if (had_previous)
        SD.remove(previous.c_str());
    return true;
}

bool save_configuration(const String &json, String &error) {
    {
        JsonDocument document;
        JsonInput input{json};
        if (deserializeJson(document, input) || !document.is<JsonObject>()) {
            error = "Configuration must be a valid JSON object";
            return false;
        }
        if (!document["tiles"].isNull() &&
            (!document["tiles"].is<JsonArray>() || document["tiles"].size() > MAX_TILES)) {
            error = "Expected at most 64 tiles (8 pages)";
            return false;
        }
        for (; input.offset < json.length(); ++input.offset) {
            char byte = json.c_str()[input.offset];
            if (byte != ' ' && byte != '\t' && byte != '\r' && byte != '\n') {
                error = "Unexpected data after the configuration object";
                return false;
            }
        }
    }
    const String path = "/macros.json", staged = "/macros.json.uploading";
    if (SD.exists(staged.c_str()) && !SD.remove(staged.c_str())) {
        error = "Cannot clear the incomplete configuration";
        return false;
    }
    File file = SD.open(staged.c_str(), FILE_WRITE);
    if (!file) {
        error = "Cannot create the staged configuration";
        return false;
    }
    size_t written = file.write(reinterpret_cast<const uint8_t *>(json.c_str()), json.length());
    file.close();
    bool matches = written == json.length();
    File verify = SD.open(staged.c_str(), FILE_READ);
    matches = matches && verify && verify.size() == json.length();
    uint8_t buffer[256];
    for (size_t offset = 0; matches && offset < json.length();) {
        size_t count = std::min(sizeof(buffer), json.length() - offset);
        matches = verify.read(buffer, count) == count &&
                  memcmp(buffer, json.c_str() + offset, count) == 0;
        offset += count;
    }
    verify.close();
    if (!matches) {
        SD.remove(staged.c_str());
        error = "Configuration write verification failed; previous file preserved";
        return false;
    }
    if (!commit_staged_file(staged, path, error)) {
        SD.remove(staged.c_str());
        return false;
    }
    return true;
}
