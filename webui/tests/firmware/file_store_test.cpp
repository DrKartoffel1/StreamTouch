#include "Arduino.h"
#include "SD.h"
#include "file_store.h"
#include <cassert>
#include <iostream>
FakeSerial Serial;
FakeSD SD;
static const char *old = "{\"tiles\":[],\"unknown\":{\"keep\":true}}";
void reset() {
    SD = FakeSD{};
    SD.add("/macros.json", old);
}
int main() {
    String error;
    for (const char *bad : {"{", "[]", "null", "42", "{}junk", "{}{}"}) {
        reset();
        assert(!save_configuration(bad, error));
        assert(SD.nodes["/macros.json"]->data == old);
    }
    reset();
    SD.write_limit = 2;
    assert(!save_configuration("{\"tiles\":[],\"extra\":7}", error));
    assert(SD.nodes["/macros.json"]->data == old && !SD.exists("/macros.json.uploading"));
    for (unsigned failure : {1, 2}) {
        reset();
        SD.fail_rename_calls = {failure};
        assert(!save_configuration("{\"extra\":7}", error));
        assert(SD.nodes["/macros.json"]->data == old);
    }
    reset();
    SD.fail_rename_calls = {2, 3};
    assert(!save_configuration("{\"extra\":7}", error));
    assert(!SD.exists("/macros.json") && SD.nodes["/macros.json.previous"]->data == old);
    SD.fail_rename_calls.clear();
    assert(recover_stored_file("/macros.json"));
    assert(SD.nodes["/macros.json"]->data == old);
    reset();
    String document = "{\"tiles\":[{\"actions\":[{\"type\":\"keys\",\"keys\":[\"A\"]},{\"type\":"
                      "\"future\",\"payload\":42}]}],\"unknown\":{\"keep\":true}}";
    assert(save_configuration(document, error));
    assert(SD.nodes["/macros.json"]->data == document && !SD.exists("/macros.json.previous"));
    reset();
    SD.add("/icons/a.png", "old bytes");
    SD.add("/icons/a.png.uploading", "new bytes");
    SD.fail_rename_calls = {2};
    assert(!commit_staged_file("/icons/a.png.uploading", "/icons/a.png", error));
    assert(SD.nodes["/icons/a.png"]->data == "old bytes");
    SD = FakeSD{};
    SD.add("/backgrounds/a.jpg.previous", "original");
    assert(recover_stored_file("/backgrounds/a.jpg") &&
           SD.nodes["/backgrounds/a.jpg"]->data == "original");
    assert(!recover_stored_file("/missing"));
    reset();
    assert(!commit_staged_file("/missing", "/macros.json", error));
    assert(SD.rename_calls == 0 && SD.nodes["/macros.json"]->data == old);
    SD.add("/icons/upload.png", "bytes");
    assert(!commit_staged_file("/icons/upload.png", "/icons", error));
    assert(SD.nodes["/icons"]->dir && SD.exists("/icons/upload.png"));
    std::cout << "File-store tests passed: malformed JSON, short writes, commit/rollback failures, "
                 "recovery and unknown-action preservation.\n";
}
