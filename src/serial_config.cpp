#include "serial_config.h"
#include "asset_transfer.h"
#include "config.h"
#include "display.h"
#include "device_settings.h"
#include "file_store.h"
#include "icon_store.h"
#include "serial_command.h"
#include "ui.h"
#include <Arduino.h>
#include <SD.h>

static void handle_command(const String &data) {
    if (data == "GET_DEVICE_STATUS") {
        device_print_status();
        return;
    }
    if (data == "GET_DISPLAY_STATUS") {
        display_print_status();
        return;
    }
    if (handle_asset_command(data) || handle_icon_command(data)) {
        return;
    } else if (data == "GET_JSON") {
        recover_stored_file("/macros.json");
        File file = SD.open("/macros.json");
        if (file) {
            Serial.print("SYNC_JSON:");
            while (file.available()) {
                Serial.write(file.read());
            }
            Serial.print("\n");
            file.close();
        } else {
            Serial.print("SYNC_JSON:{}\n");
        }
    } else if (data.startsWith("JSON:")) {
        String json = data.substring(5);
        String error;
        if (save_configuration(json, error)) {
            config_load();
            ui_rebuild();
        } else {
            Serial.print("CONFIG_ERROR:");
            Serial.println(error);
        }
    } else if (data.startsWith("GET_FILE:")) {
        String path = data.substring(9);
        recover_stored_file(path);
        File file = SD.open(path.c_str(), FILE_READ);
        if (file) {
            size_t size = file.size();
            Serial.print("SYNC_FILE:");
            Serial.print(path);
            Serial.print(":");
            Serial.print(size);
            Serial.print("\n");

            uint8_t buf[512];
            while (file.available()) {
                size_t bytesRead = file.read(buf, sizeof(buf));
                Serial.write(buf, bytesRead);
            }
            file.close();
        } else {
            Serial.print("SYNC_FILE:");
            Serial.print(path);
            Serial.print(":0\n");
        }
    } else if (data.startsWith("DELETE_FILE:")) {
        String path = data.substring(12);
        SD.remove(path.c_str());
    } else if (data.startsWith("FILE:")) {
        // Format: FILE:/icons/play.png:1024
        int firstColon = 4;
        int secondColon = data.indexOf(':', firstColon + 1);
        if (secondColon != -1) {
            String path = data.substring(firstColon + 1, secondColon);
            String size_text = data.substring(secondColon + 1);
            int size = size_text.toInt();
            bool valid = path.length() > 0 && size_text.length() > 0 && size_text.length() <= 6 &&
                         size > 0 && size <= 512 * 1024;
            for (size_t i = 0; i < size_text.length(); ++i)
                if (size_text[i] < '0' || size_text[i] > '9')
                    valid = false;
            if (!valid) {
                Serial.println("FILE_ERROR:Invalid file header or size");
                return;
            }

            // Ensure directory exists
            if (path.startsWith("/icons/")) {
                SD.mkdir("/icons");
            }

            String staged = path + ".uploading";
            if (SD.exists(staged.c_str()) && !SD.remove(staged.c_str())) {
                Serial.println("FILE_ERROR:Cannot clear incomplete file");
                return;
            }
            File file = SD.open(staged.c_str(), FILE_WRITE);
            if (file) {
                size_t received = 0;
                bool complete = true;
                uint32_t start = millis();
                uint8_t buffer[512];
                while (received < size_t(size) && millis() - start < 5000) {
                    size_t count = std::min(sizeof(buffer), std::min(size_t(Serial.available()),
                                                                     size_t(size) - received));
                    if (!count) {
                        delay(1);
                        continue;
                    }
                    count = Serial.readBytes(buffer, count);
                    complete = (file.write(buffer, count) == count) && complete;
                    received += count;
                }
                file.close();
                String error;
                if (complete && received == size_t(size) &&
                    commit_staged_file(staged, path, error)) {
                    Serial.println("FILE_OK");
                } else {
                    SD.remove(staged.c_str());
                    Serial.println(
                        "FILE_ERROR:Incomplete or uncommitted transfer; previous file preserved");
                }
            } else {
                Serial.println("FILE_ERROR:Cannot create staged file");
            }
        } else {
            Serial.println("FILE_ERROR:Invalid file header");
        }
    }
}

void serial_loop() {
    static SerialCommand pending;
    static uint32_t last_byte = 0;
    if (pending.waiting() && millis() - last_byte > 1000) {
        pending.reset();
        Serial.println("COMMAND_ERROR:Incomplete text command timed out");
    }
    // Bound work per iteration; never block waiting for the rest of a text line.
    for (unsigned count = 0; count < 512 && Serial.available(); ++count) {
        String command;
        last_byte = millis();
        auto result = pending.push(char(Serial.read()), command);
        if (result == SerialCommand::Result::Rejected) {
            Serial.println("COMMAND_ERROR:Malformed, oversized or unallocatable command");
            return;
        }
        if (result == SerialCommand::Result::Ready) {
            handle_command(command);
            // FILE/FILE_BEGIN handlers own binary reads. Never parse their payload as text.
            return;
        }
    }
}
