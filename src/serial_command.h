#pragma once
#include <Arduino.h>
#include <algorithm>
#include <utility>

// Match the client's 1MiB configuration limit, plus the JSON: command prefix.
class SerialCommand {
  public:
    static constexpr size_t MaximumBytes = 1024 * 1024 + 5;
    enum class Result { Pending, Ready, Rejected };
    bool waiting() const { return discarding_ || buffer_.length() != 0; }
    void reset() {
        String empty;
        std::swap(buffer_, empty);
        reserved_ = 0;
        discarding_ = false;
    }
    Result push(char byte, String &command) {
        if (byte == '\n') {
            if (discarding_) {
                reset();
                return Result::Rejected;
            }
            std::swap(command, buffer_);
            command.trim();
            reserved_ = 0;
            return Result::Ready;
        }
        if (discarding_)
            return Result::Pending;
        if (!byte) {
            reject();
            return Result::Pending;
        }
        if (buffer_.length() >= MaximumBytes) {
            reject();
            return Result::Pending;
        }
        if (buffer_.length() == reserved_) {
            size_t next = std::min(MaximumBytes, reserved_ ? reserved_ * 2 : size_t(256));
            if (!buffer_.reserve(next)) {
                reject();
                return Result::Pending;
            }
            reserved_ = next;
        }
        if (!buffer_.concat(byte))
            reject();
        return Result::Pending;
    }

  private:
    String buffer_;
    size_t reserved_ = 0;
    bool discarding_ = false;
    void reject() {
        reset();
        discarding_ = true;
    }
};
