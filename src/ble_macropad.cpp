#include "ble_macropad.h"
#include <BleKeyboard.h>
#include <NimBLEDevice.h>

BleKeyboard bleKeyboard("StreamTouch", "GSD", 100);

#define SERVICE_UUID "12345678-1234-5678-1234-56789abcdef0"
#define CHAR_UUID    "12345678-1234-5678-1234-56789abcdef1"

class CustomCallbacks: public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic *pCharacteristic) {
        std::string value = pCharacteristic->getValue();
        Serial.printf("Received data length: %d\n", value.length());
    }
};

static bool keys_pressed = false;
static uint32_t press_time = 0;
static std::vector<uint16_t> current_keys;
static std::vector<uint16_t> current_media_keys;

void ble_init() {
    bleKeyboard.begin();

    NimBLEServer* pServer = NimBLEDevice::getServer();
    if (pServer) {
        NimBLEService* pService = pServer->createService(SERVICE_UUID);
        NimBLECharacteristic* pCharacteristic = pService->createCharacteristic(
            CHAR_UUID,
            NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
        );
        pCharacteristic->setCallbacks(new CustomCallbacks());
        pService->start();
        
        NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
        pAdvertising->addServiceUUID(SERVICE_UUID);
        pAdvertising->start();
    }
}

void ble_loop() {
    if (keys_pressed && (millis() - press_time >= 50)) {
        bleKeyboard.releaseAll();
        
        // Ensure a complete zero-report is sent for media keys (Consumer Control)
        // This explicitly fixes Linux/CachyOS missing the key-up event.
        if (!current_media_keys.empty()) {
            MediaKeyReport zero_report = {0, 0};
            bleKeyboard.sendReport(&zero_report);
        }
        
        keys_pressed = false;
        current_keys.clear();
        current_media_keys.clear();
    }
}

void ble_send_keys(const std::vector<uint16_t>& keys, const std::vector<uint16_t>& media_keys) {
    if (!bleKeyboard.isConnected()) return;

    for (uint16_t k : keys) {
        bleKeyboard.press(k);
    }
    
    if (!media_keys.empty()) {
        MediaKeyReport report = {0, 0};
        for (uint16_t mk : media_keys) {
            report[0] |= mk & 0xFF;
            report[1] |= (mk >> 8) & 0xFF;
        }
        bleKeyboard.sendReport(&report);
    }

    current_keys = keys;
    current_media_keys = media_keys;
    press_time = millis();
    keys_pressed = true;
}
