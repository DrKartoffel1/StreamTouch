const keyCodes: Record<string, string> = {
  ControlLeft: "LEFT_CTRL",
  ControlRight: "RIGHT_CTRL",
  ShiftLeft: "LEFT_SHIFT",
  ShiftRight: "RIGHT_SHIFT",
  AltLeft: "LEFT_ALT",
  AltRight: "RIGHT_ALT",
  MetaLeft: "LEFT_GUI",
  MetaRight: "RIGHT_GUI",
  OSLeft: "LEFT_GUI",
  OSRight: "RIGHT_GUI",
  Space: "SPACE",
  Enter: "ENTER",
  NumpadEnter: "ENTER",
  Tab: "TAB",
  Escape: "ESC",
  Backspace: "BACKSPACE",
  Delete: "DELETE",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  Minus: "MINUS",
  NumpadSubtract: "MINUS",
  Equal: "EQUAL",
};

export function mapKey(e: Pick<KeyboardEvent, "code" | "key">): string | null {
  if (keyCodes[e.code]) return keyCodes[e.code];
  if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) return e.code;
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad\d$/.test(e.code)) return e.code.slice(6);
  return null;
}
