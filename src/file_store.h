#pragma once
#include <Arduino.h>

// Finish a staged write without discarding the previous file on commit failure.
bool commit_staged_file(const String &staged, const String &path, String &error);
// Recover a previous file if power was lost between the two commit renames.
bool recover_stored_file(const String &path);
bool save_configuration(const String &json, String &error);
