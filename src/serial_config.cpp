#include "serial_config.h"
#include <Arduino.h>
#include <SD.h>
#include "config.h"
#include "ui.h"

void serial_loop() {
    if (Serial.available()) {
        String data = Serial.readStringUntil('\n');
        data.trim();
        
        if (data == "GET_JSON") {
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
        }
        else if (data.startsWith("JSON:")) {
            String json = data.substring(5);
            SD.remove("/macros.json");
            File file = SD.open("/macros.json", FILE_WRITE);
            if (file) {
                file.print(json);
                file.close();
                config_load();
                ui_rebuild();
            }
        }
        else if (data.startsWith("GET_FILE:")) {
            String path = data.substring(9);
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
        }
        else if (data.startsWith("DELETE_FILE:")) {
            String path = data.substring(12);
            SD.remove(path.c_str());
        }
        else if (data.startsWith("FILE:")) {
            // Format: FILE:/icons/play.png:1024
            int firstColon = 4;
            int secondColon = data.indexOf(':', firstColon + 1);
            if (secondColon != -1) {
                String path = data.substring(firstColon + 1, secondColon);
                int size = data.substring(secondColon + 1).toInt();
                
                // Ensure directory exists
                if (path.startsWith("/icons/")) {
                    SD.mkdir("/icons");
                }
                
                SD.remove(path.c_str());
                File file = SD.open(path.c_str(), FILE_WRITE);
                if (file) {
                    int bytesRead = 0;
                    uint32_t start = millis();
                    while (bytesRead < size && millis() - start < 5000) {
                        if (Serial.available()) {
                            file.write(Serial.read());
                            bytesRead++;
                        }
                    }
                    file.close();
                    Serial.println("FILE_OK");
                }
            }
        }
    }
}
