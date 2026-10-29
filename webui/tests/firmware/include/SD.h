#pragma once
#include "Arduino.h"
#include <filesystem>
#include <limits>
#include <map>
#include <memory>
#include <set>
#include <vector>
#define FILE_READ "r"
#define FILE_WRITE "w"
struct FakeNode {
    bool dir = false;
    std::string data;
    size_t write_limit = std::numeric_limits<size_t>::max();
};
struct File {
    std::shared_ptr<FakeNode> node;
    std::string path;
    size_t pos = 0, child = 0;
    explicit operator bool() const { return !!node; }
    bool isDirectory() const { return node && node->dir; }
    const char *name() const { return path.c_str(); }
    size_t size() const { return node ? node->data.size() : 0; }
    int read() { return node && pos < node->data.size() ? uint8_t(node->data[pos++]) : -1; }
    size_t readBytes(char *buffer, size_t size) {
        size_t n = 0;
        for (; n < size; n++) {
            int c = read();
            if (c < 0)
                break;
            buffer[n] = char(c);
        }
        return n;
    }
    size_t read(uint8_t *buffer, size_t size) {
        return readBytes(reinterpret_cast<char *>(buffer), size);
    }
    size_t available() const { return node ? node->data.size() - pos : 0; }
    size_t write(const uint8_t *data, size_t count) {
        if (!node)
            return 0;
        count = std::min(count, node->write_limit);
        node->data.append(reinterpret_cast<const char *>(data), count);
        return count;
    }
    File openNextFile();
    void close() {}
};
struct FakeSD {
    std::map<std::string, std::shared_ptr<FakeNode>> nodes;
    std::vector<std::string> removals;
    bool refuse = false, available = true;
    size_t write_limit = std::numeric_limits<size_t>::max();
    unsigned rename_calls = 0;
    std::set<unsigned> fail_rename_calls;
    std::string key(std::string path) {
        path = std::filesystem::path(path).lexically_normal().string();
        std::transform(path.begin(), path.end(), path.begin(),
                       [](unsigned char c) { return std::tolower(c); });
        return path;
    }
    void add(std::string path, std::string data) {
        path = key(path);
        nodes[path] = std::make_shared<FakeNode>(FakeNode{false, data});
        auto parent = std::filesystem::path(path).parent_path();
        while (!parent.empty() && parent != "/") {
            nodes[parent.string()] = std::make_shared<FakeNode>(FakeNode{true, {}});
            parent = parent.parent_path();
        }
    }
    bool exists(const char *path) { return available && nodes.count(key(path)); }
    File open(const char *path, const char *mode = FILE_READ) {
        auto p = key(path);
        if (std::string(mode) == FILE_WRITE && !exists(p.c_str()))
            add(p, "");
        if (!exists(p.c_str()))
            return {};
        if (std::string(mode) == FILE_WRITE)
            nodes[p]->write_limit = write_limit;
        return {nodes[p], p};
    }
    bool remove(const char *path) {
        removals.push_back(path);
        return !refuse && nodes.erase(key(path));
    }
    bool mkdir(const char *path) {
        nodes[key(path)] = std::make_shared<FakeNode>(FakeNode{true, {}});
        return true;
    }
    bool rename(const char *oldPath, const char *newPath) {
        auto old = key(oldPath), next = key(newPath);
        ++rename_calls;
        if (!nodes.count(old) || refuse || fail_rename_calls.count(rename_calls))
            return false;
        nodes[next] = nodes[old];
        nodes.erase(old);
        return true;
    }
    int cardType() { return available ? 1 : 0; }
};
extern FakeSD SD;
inline File File::openNextFile() {
    std::vector<std::string> children;
    for (const auto &[name, n] : SD.nodes)
        if (std::filesystem::path(name).parent_path() == path)
            children.push_back(name);
    if (child >= children.size())
        return {};
    return SD.open(children[child++].c_str());
}
