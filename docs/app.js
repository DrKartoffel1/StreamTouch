let port = null;
let writer = null;
let reader = null;
let readerAbortController = null;
let isSyncing = false;
let hasSynced = false;
let selectedSlot = -1;
let macrosData = { tiles: Array(8).fill().map(() => ({})), theme: {} };

const themeProps = ['Icon', 'Button', 'Bg', 'Border', 'Text', 'Press', 'BorderPress', 'TextPress', 'IconPress', 'Anim'];
const themeKeys = ['icon', 'button', 'background', 'border', 'text', 'button_press', 'border_pressed', 'text_pressed', 'icon_pressed', 'animation'];
const themeCss = ['--theme-icon', '--theme-button', '--theme-bg', '--theme-border', '--theme-text', '--theme-press', '--theme-border-press', '--theme-text-press', '--theme-icon-press', '--theme-anim'];

const connectBtn = document.getElementById('connectBtn');
const statusSpan = document.getElementById('status');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const configForm = document.getElementById('configForm');
const configLabel = document.getElementById('configLabel');
const actionTypeRadios = document.getElementsByName('actionType');
const mediaContainer = document.getElementById('mediaContainer');
const mediaAction = document.getElementById('mediaAction');
const appContainer = document.getElementById('appContainer');
const appAction = document.getElementById('appAction');
const keysContainer = document.getElementById('keysContainer');
const keysList = document.getElementById('keysList');
const addKeyBtn = document.getElementById('addKeyBtn');
const recordMacroBtn = document.getElementById('recordMacroBtn');
const dropZone = document.getElementById('drop-zone');
const slots = document.querySelectorAll('.btn-slot');

// Toggle between Keys and Media and Application
Array.from(actionTypeRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'media') {
            mediaContainer.style.display = 'block';
            keysContainer.style.display = 'none';
            appContainer.style.display = 'none';
        } else if (e.target.value === 'application') {
            mediaContainer.style.display = 'none';
            keysContainer.style.display = 'none';
            appContainer.style.display = 'block';
        } else {
            mediaContainer.style.display = 'none';
            keysContainer.style.display = 'block';
            appContainer.style.display = 'none';
        }
    });
});

// Add Key input field
function createKeyInput(value = '') {
    const div = document.createElement('div');
    div.style.marginBottom = '5px';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = 'e.g. KEY_A or KEY_LEFT_CTRL';
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '-';
    removeBtn.type = 'button';
    removeBtn.style.marginLeft = '5px';
    removeBtn.onclick = () => div.remove();
    div.appendChild(input);
    div.appendChild(removeBtn);
    keysList.appendChild(div);
}

addKeyBtn.addEventListener('click', () => createKeyInput());

// Macro Recorder Logic
let isRecording = false;

function mapKeyToFirmware(e) {
    const code = e.code;
    const key = e.key;
    
    if (code === 'ControlLeft') return 'LEFT_CTRL';
    if (code === 'ControlRight') return 'RIGHT_CTRL';
    if (code === 'ShiftLeft') return 'LEFT_SHIFT';
    if (code === 'ShiftRight') return 'RIGHT_SHIFT';
    if (code === 'AltLeft') return 'LEFT_ALT';
    if (code === 'AltRight') return 'RIGHT_ALT';
    if (code === 'MetaLeft' || code === 'OSLeft') return 'LEFT_GUI';
    if (code === 'MetaRight' || code === 'OSRight') return 'RIGHT_GUI';
    if (code === 'Space') return 'SPACE';
    if (code === 'Enter' || code === 'NumpadEnter') return 'ENTER';
    if (code === 'Tab') return 'TAB';
    if (code === 'Escape') return 'ESC';
    if (code === 'Backspace') return 'BACKSPACE';
    if (code === 'Delete') return 'DELETE';
    if (code === 'ArrowLeft') return 'LEFT';
    if (code === 'ArrowRight') return 'RIGHT';
    if (code === 'ArrowUp') return 'UP';
    if (code === 'ArrowDown') return 'DOWN';
    if (code === 'Minus' || code === 'NumpadSubtract') return 'MINUS';
    if (code === 'Equal') return 'EQUAL';
    
    if (code.startsWith('F') && code.length > 1) {
        const num = parseInt(code.substring(1));
        if (num >= 1 && num <= 24) return code;
    }
    
    if (code.startsWith('Key') && code.length === 4) {
        return code.substring(3).toUpperCase();
    }
    
    if (code.startsWith('Digit') && code.length === 6) {
        return code.substring(5);
    }

    if (code.startsWith('Numpad') && code.length === 7) {
        return code.substring(6);
    }
    
    if (key.length === 1) {
        return key.toUpperCase();
    }
    
    return null;
}

if (recordMacroBtn) {
    recordMacroBtn.addEventListener('click', () => {
        isRecording = !isRecording;
        if (isRecording) {
            recordMacroBtn.textContent = 'Recording... (Press Keys)';
            recordMacroBtn.style.backgroundColor = '#008080';
            keysList.innerHTML = '';
        } else {
            recordMacroBtn.textContent = 'Record Macro';
            recordMacroBtn.style.backgroundColor = '';
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const mappedKey = mapKeyToFirmware(e);
    if (mappedKey) {
        createKeyInput(mappedKey);
    }
});

// Handle slot selection
slots.forEach(slot => {
    slot.addEventListener('click', () => {
        slots.forEach(s => s.classList.remove('selected'));
        slot.classList.add('selected');
        selectedSlot = parseInt(slot.dataset.slot, 10);
        
        const tileData = macrosData.tiles[selectedSlot] || {};
        
        if (isRecording) {
            isRecording = false;
            recordMacroBtn.textContent = 'Record Macro';
            recordMacroBtn.style.backgroundColor = '';
        }
        
        // Show form
        configForm.style.display = 'block';
        
        // Populate form
        configLabel.value = tileData.label || '';
        keysList.innerHTML = ''; // Clear existing keys
        
        if (tileData.actions && tileData.actions.length > 0) {
            const firstAction = tileData.actions[0];
            if (firstAction.type === 'media') {
                actionTypeRadios[1].checked = true;
                mediaContainer.style.display = 'block';
                keysContainer.style.display = 'none';
                appContainer.style.display = 'none';
                mediaAction.value = (firstAction.keys && firstAction.keys.length > 0) ? firstAction.keys[0] : 'MEDIA_PLAY_PAUSE';
            } else if (firstAction.type === 'application') {
                actionTypeRadios[2].checked = true;
                mediaContainer.style.display = 'none';
                keysContainer.style.display = 'none';
                appContainer.style.display = 'block';
                appAction.value = (firstAction.keys && firstAction.keys.length > 0) ? firstAction.keys[0] : 'APP_BROWSER';
            } else {
                actionTypeRadios[0].checked = true;
                mediaContainer.style.display = 'none';
                appContainer.style.display = 'none';
                keysContainer.style.display = 'block';
                const keys = firstAction.keys || [];
                keys.forEach(k => createKeyInput(k));
                if (keys.length === 0) createKeyInput();
            }
        } else {
            actionTypeRadios[0].checked = true;
            mediaContainer.style.display = 'none';
            appContainer.style.display = 'none';
            keysContainer.style.display = 'block';
            createKeyInput();
        }
        
        const clearIconBtn = document.getElementById('clearIconBtn');
        if (clearIconBtn) {
            if (tileData.icon) {
                clearIconBtn.style.display = 'inline-block';
            } else {
                clearIconBtn.style.display = 'none';
            }
        }
    });
});

// Update slot labels
function updateSlotsUI() {
    slots.forEach(slot => {
        const slotIdx = parseInt(slot.dataset.slot, 10);
        const tileData = macrosData.tiles[slotIdx] || {};
        const labelEl = slot.querySelector('.slot-label');
        if (labelEl) {
            labelEl.textContent = tileData.label || `Slot ${slotIdx}`;
        }
        // Image display is handled only when uploading a new one during this session.
        // We do NOT load image from local storage or from device here.
    });
}

// Read incoming serial data
async function readLoop(readableStream) {
    let buffer = new Uint8Array(0);
    let mode = 'text';
    let expectedLength = 0;
    let binaryPath = '';
    const textDecoder = new TextDecoder();
    
    try {
        reader = readableStream.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;
                
                let processing = true;
                while (processing && buffer.length > 0) {
                    if (mode === 'text') {
                        let newlineIdx = buffer.indexOf(10); // \n
                        if (newlineIdx !== -1) {
                            const lineBytes = buffer.slice(0, newlineIdx);
                            let line = textDecoder.decode(lineBytes);
                            if (line.endsWith('\r')) line = line.slice(0, -1);
                            buffer = buffer.slice(newlineIdx + 1);
                            
                            if (line.startsWith('SYNC_JSON:')) {
                                isSyncing = true;
                                hasSynced = true;
                                const jsonStr = line.substring(10);
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed && typeof parsed === 'object') {
                                        macrosData = parsed;
                                        if (!Array.isArray(macrosData.tiles)) macrosData.tiles = [];
                                        while (macrosData.tiles.length < 8) macrosData.tiles.push({});
                                        
                                        if (!macrosData.theme_presets) macrosData.theme_presets = {};

                                        const classicPresets = {
                                            "Kartoffel": { icon: "#008080", button: "#2A2A2A", background: "#0d0d0d", border: "#008080", text: "#ffffff", button_press: "#008080", border_pressed: "#008080", text_pressed: "#ffffff", icon_pressed: "#008080", animation: "#1a1a1a" },
                                            "Dracula": { icon: "#ff79c6", button: "#44475a", background: "#282a36", border: "#bd93f9", text: "#f8f8f2", button_press: "#ff79c6", border_pressed: "#ff79c6", text_pressed: "#282a36", icon_pressed: "#282a36", animation: "#ff79c6" },
                                            "Nord": { icon: "#88c0d0", button: "#3b4252", background: "#2e3440", border: "#81a1c1", text: "#d8dee9", button_press: "#88c0d0", border_pressed: "#88c0d0", text_pressed: "#2e3440", icon_pressed: "#2e3440", animation: "#88c0d0" },
                                            "Monokai": { icon: "#a6e22e", button: "#3e3d32", background: "#272822", border: "#f92672", text: "#f8f8f2", button_press: "#a6e22e", border_pressed: "#a6e22e", text_pressed: "#272822", icon_pressed: "#272822", animation: "#a6e22e" },
                                            "Solarized Dark": { icon: "#2aa198", button: "#073642", background: "#002b36", border: "#268bd2", text: "#839496", button_press: "#2aa198", border_pressed: "#2aa198", text_pressed: "#002b36", icon_pressed: "#002b36", animation: "#2aa198" },
                                            "Gruvbox": { icon: "#b8bb26", button: "#3c3836", background: "#282828", border: "#fabd2f", text: "#ebdbb2", button_press: "#b8bb26", border_pressed: "#b8bb26", text_pressed: "#282828", icon_pressed: "#282828", animation: "#b8bb26" }
                                        };
                                        for (const [pName, pData] of Object.entries(classicPresets)) {
                                            macrosData.theme_presets[pName] = pData;
                                        }

                                        const themePresetSelect = document.getElementById('themePresetSelect');
                                        if (themePresetSelect) {
                                            themePresetSelect.innerHTML = '<option value="">Select a preset...</option>';
                                            for (const presetName in macrosData.theme_presets) {
                                                const opt = document.createElement('option');
                                                opt.value = presetName;
                                                opt.textContent = presetName;
                                                themePresetSelect.appendChild(opt);
                                            }
                                        }
                                        
                                        if (macrosData.theme) {
                                            themeKeys.forEach((key, idx) => {
                                                if (macrosData.theme[key]) {
                                                    const val = macrosData.theme[key];
                                                    const colorInput = document.getElementById(`theme${themeProps[idx]}Color`);
                                                    const textInput = document.getElementById(`theme${themeProps[idx]}Text`);
                                                    if (colorInput && textInput) {
                                                        colorInput.value = val;
                                                        textInput.value = val;
                                                        document.documentElement.style.setProperty(themeCss[idx], val);
                                                    }
                                                }
                                            });
                                        }

                                        statusSpan.textContent = 'Connected & Synced';
                                        updateSlotsUI();
                                        if (selectedSlot !== -1) slots[selectedSlot].click();
                                        
                                        // Request icons
                                        if (writer) {
                                            const textEncoder = new TextEncoder();
                                            macrosData.tiles.forEach(tile => {
                                                if (tile.icon) {
                                                    writer.write(textEncoder.encode(`GET_FILE:${tile.icon}\n`));
                                                }
                                            });
                                        }
                                    }
                                    isSyncing = false;
                                } catch (e) {
                                    statusSpan.textContent = 'Parsing... Length: ' + jsonStr.length;
                                    isSyncing = false;
                                }
                            } else if (line.startsWith('SYNC_FILE:')) {
                                const parts = line.substring(10).split(':');
                                if (parts.length >= 2) {
                                    binaryPath = parts.slice(0, -1).join(':');
                                    expectedLength = parseInt(parts[parts.length - 1], 10);
                                    if (expectedLength > 0) {
                                        mode = 'binary';
                                        statusSpan.textContent = `Receiving file: ${binaryPath}`;
                                    }
                                }
                            }
                        } else {
                            processing = false;
                        }
                    } else if (mode === 'binary') {
                        if (buffer.length >= expectedLength) {
                            const fileData = buffer.slice(0, expectedLength);
                            buffer = buffer.slice(expectedLength);
                            
                            const blob = new Blob([fileData]);
                            const blobUrl = URL.createObjectURL(blob);
                            
                            slots.forEach(slot => {
                                const slotIdx = parseInt(slot.dataset.slot, 10);
                                if (macrosData.tiles[slotIdx] && macrosData.tiles[slotIdx].icon === binaryPath) {
                                    const iconEl = slot.querySelector('.slot-icon');
                                    if (iconEl) {
                                        iconEl.style.webkitMaskImage = `url(${blobUrl})`;
                                        iconEl.style.maskImage = `url(${blobUrl})`;
                                        iconEl.style.display = 'block';
                                    }
                                }
                            });
                            
                            mode = 'text';
                            statusSpan.textContent = 'Connected & Synced';
                        } else {
                            statusSpan.textContent = `Downloading ${binaryPath}: ${buffer.length}/${expectedLength} bytes`;
                            processing = false;
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error reading serial data:', error);
    } finally {
        if (reader) reader.releaseLock();
    }
}

connectBtn.addEventListener('click', async () => {
    if (port) {
        if (reader) await reader.cancel();
        if (writer) writer.releaseLock();
        await port.close();
        port = null;
        connectBtn.textContent = 'Connect';
        statusSpan.textContent = 'Disconnected';
        configForm.style.display = 'none';
        selectedSlot = -1;
        slots.forEach(s => s.classList.remove('selected'));
        return;
    }
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        
        try {
            await port.setSignals({ dataTerminalReady: false, requestToSend: false });
        } catch (e) {}
        
        writer = port.writable.getWriter();
        
        hasSynced = false;
        connectBtn.textContent = 'Disconnect';
        statusSpan.textContent = 'Connected (Syncing...)';
        
        // Start reading loop immediately using raw readable stream
        readLoop(port.readable);
        
        // Wait for ESP32 to reboot after DTR/RTS toggle, then retry GET_JSON until successful
        (async () => {
            await new Promise(r => setTimeout(r, 2000));
            const textEncoder = new TextEncoder();
            for (let i = 0; i < 10; i++) {
                if (hasSynced || port === null) break;
                console.log("Sending GET_JSON...");
                try {
                    await writer.write(textEncoder.encode("GET_JSON\n"));
                } catch (e) {}
                await new Promise(r => setTimeout(r, 500));
            }
        })();
        
    } catch (e) {
        console.error(e);
        statusSpan.textContent = 'Connection failed';
    }
});

if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
        if (!writer || selectedSlot === -1) {
            alert('Connect and select a slot first!');
            return;
        }
        
        const tileData = macrosData.tiles[selectedSlot];
        tileData.label = configLabel.value;
        
        const actionType = Array.from(actionTypeRadios).find(r => r.checked).value;
        if (actionType === 'media') {
            tileData.actions = [ { type: 'media', keys: [ mediaAction.value ] } ];
            delete tileData.type; delete tileData.media; delete tileData.keys;
        } else if (actionType === 'application') {
            tileData.actions = [ { type: 'application', keys: [ appAction.value ] } ];
            delete tileData.type; delete tileData.media; delete tileData.keys;
        } else {
            const keys = [];
            keysList.querySelectorAll('input').forEach(input => {
                const val = input.value.trim();
                if (val) keys.push(val);
            });
            tileData.actions = [ { type: 'keys', keys: keys } ];
            delete tileData.type; delete tileData.media; delete tileData.keys;
        }
        
        try {
            const textEncoder = new TextEncoder();
            const payload = "JSON:" + JSON.stringify(macrosData) + "\n";
            await writer.write(textEncoder.encode(payload));
            updateSlotsUI();
            alert('Config sent successfully!');
        } catch (e) {
            console.error(e);
            alert('Failed to send config');
        }
    });
}

// Drop zone for images
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('hover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('hover'), false);
});

dropZone.addEventListener('drop', async (e) => {
    if (!writer) {
        alert("Connect to the Macropad first!");
        return;
    }
    if (selectedSlot === -1) {
        alert("Select a slot to assign the image to first!");
        return;
    }
    
    let dt = e.dataTransfer;
    let files = dt.files;
    if (files.length > 0) {
        let file = files[0];
        try {
            let buffer = await file.arrayBuffer();
            const textEncoder = new TextEncoder();
            
            // Delete old icon if it exists
            const oldIcon = macrosData.tiles[selectedSlot].icon;
            if (oldIcon) {
                await writer.write(textEncoder.encode(`DELETE_FILE:${oldIcon}\n`));
                await new Promise(r => setTimeout(r, 100));
            }
            
            // Send file upload command
            const header = `FILE:/icons/${file.name}:${buffer.byteLength}\n`;
            await writer.write(textEncoder.encode(header));
            
            // Send raw binary buffer
            await writer.write(new Uint8Array(buffer));
            
            // Update image preview in the slot
            const blobUrl = URL.createObjectURL(new Blob([buffer]));
            const slotEl = slots[selectedSlot];
            const iconEl = slotEl.querySelector('.slot-icon');
            if (iconEl) {
                iconEl.style.webkitMaskImage = `url(${blobUrl})`;
                iconEl.style.maskImage = `url(${blobUrl})`;
                iconEl.style.display = 'block';
            }
            
            // Update JSON data and save
            macrosData.tiles[selectedSlot].icon = `/icons/${file.name}`;
            const payload = "JSON:" + JSON.stringify(macrosData) + "\n";
            await writer.write(textEncoder.encode(payload));
            
            alert(`File ${file.name} uploaded to slot ${selectedSlot} and saved to config!`);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed: ' + error.message);
        }
    }
});

const clearIconBtn = document.getElementById('clearIconBtn');
if (clearIconBtn) {
    clearIconBtn.addEventListener('click', async () => {
        if (!writer || selectedSlot === -1) return;
        const tileData = macrosData.tiles[selectedSlot];
        if (tileData && tileData.icon) {
            const textEncoder = new TextEncoder();
            await writer.write(textEncoder.encode(`DELETE_FILE:${tileData.icon}\n`));
            
            delete tileData.icon;
            
            const payload = "JSON:" + JSON.stringify(macrosData) + "\n";
            await writer.write(textEncoder.encode(payload));
            
            const slotEl = slots[selectedSlot];
            const iconEl = slotEl.querySelector('.slot-icon');
            if (iconEl) {
                iconEl.style.display = 'none';
            }
            clearIconBtn.style.display = 'none';
            alert('Icon cleared and deleted from SD card!');
        }
    });
}

// Theme Logic
themeProps.forEach((prop, idx) => {
    const colorInput = document.getElementById(`theme${prop}Color`);
    const textInput = document.getElementById(`theme${prop}Text`);
    const updateTheme = (val) => {
        colorInput.value = val;
        textInput.value = val;
        document.documentElement.style.setProperty(themeCss[idx], val);
        if(!macrosData.theme) macrosData.theme = {};
        macrosData.theme[themeKeys[idx]] = val;
    };
    if (colorInput && textInput) {
        colorInput.addEventListener('input', (e) => {
            if (isSyncing) return;
            updateTheme(e.target.value);
        });
        textInput.addEventListener('input', (e) => {
            if (isSyncing) return;
            if(/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                updateTheme(e.target.value);
            }
        });
    }
});

const saveThemeBtn = document.getElementById('saveThemeBtn');
if (saveThemeBtn) {
    saveThemeBtn.addEventListener('click', async () => {
        if (!writer) {
            alert('Connect first!');
            return;
        }
        try {
            const textEncoder = new TextEncoder();
            const payload = "JSON:" + JSON.stringify(macrosData) + "\n";
            await writer.write(textEncoder.encode(payload));
            alert('Theme saved successfully!');
        } catch (e) {
            console.error(e);
            alert('Failed to send theme');
        }
    });
}

// Theme Presets Logic
const themePresetSelect = document.getElementById('themePresetSelect');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const deletePresetBtn = document.getElementById('deletePresetBtn');
const presetNameInput = document.getElementById('presetNameInput');
const savePresetBtn = document.getElementById('savePresetBtn');
const updatePresetBtn = document.getElementById('updatePresetBtn');

const protectedPresets = ['Kartoffel', 'Dracula', 'Nord', 'Monokai', 'Solarized Dark', 'Gruvbox'];

if (themePresetSelect) {
    themePresetSelect.addEventListener('change', () => {
        const selected = themePresetSelect.value;
        if (protectedPresets.includes(selected) || !selected) {
            if (deletePresetBtn) deletePresetBtn.style.display = 'none';
            if (updatePresetBtn) updatePresetBtn.style.display = 'none';
        } else {
            if (deletePresetBtn) deletePresetBtn.style.display = 'block';
            if (updatePresetBtn) updatePresetBtn.style.display = 'block';
        }
    });
}

async function syncAndSaveTheme() {
    if (!writer) {
        alert('Connect first!');
        return;
    }
    try {
        const textEncoder = new TextEncoder();
        const payload = "JSON:" + JSON.stringify(macrosData) + "\n";
        await writer.write(textEncoder.encode(payload));
    } catch (e) {
        console.error(e);
        alert('Failed to sync theme');
    }
}

function applyThemeColors(themeData) {
    themeKeys.forEach((key, idx) => {
        if (themeData[key]) {
            const val = themeData[key];
            const colorInput = document.getElementById(`theme${themeProps[idx]}Color`);
            const textInput = document.getElementById(`theme${themeProps[idx]}Text`);
            if (colorInput && textInput) {
                colorInput.value = val;
                textInput.value = val;
                document.documentElement.style.setProperty(themeCss[idx], val);
            }
        }
    });
}

if (loadPresetBtn) {
    loadPresetBtn.addEventListener('click', async () => {
        const presetName = themePresetSelect.value;
        if (!presetName || !macrosData.theme_presets || !macrosData.theme_presets[presetName]) {
            alert('Please select a valid preset');
            return;
        }
        macrosData.theme = JSON.parse(JSON.stringify(macrosData.theme_presets[presetName]));
        applyThemeColors(macrosData.theme);
        await syncAndSaveTheme();
        alert(`Loaded preset: ${presetName}`);
    });
}

if (savePresetBtn) {
    savePresetBtn.addEventListener('click', async () => {
        const presetName = presetNameInput.value.trim();
        if (!presetName) {
            alert('Please enter a preset name');
            return;
        }
        
        if (protectedPresets.includes(presetName)) {
            alert('Cannot overwrite built-in presets. Please choose a different name.');
            return;
        }

        if (!macrosData.theme_presets) macrosData.theme_presets = {};
        if (!macrosData.theme) macrosData.theme = {};
        macrosData.theme_presets[presetName] = JSON.parse(JSON.stringify(macrosData.theme));
        
        let exists = false;
        for(let i=0; i<themePresetSelect.options.length; i++) {
            if(themePresetSelect.options[i].value === presetName) exists = true;
        }
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = presetName;
            opt.textContent = presetName;
            themePresetSelect.appendChild(opt);
        }
        themePresetSelect.value = presetName;
        presetNameInput.value = '';
        if (deletePresetBtn) deletePresetBtn.style.display = 'block';
        if (updatePresetBtn) updatePresetBtn.style.display = 'block';
        await syncAndSaveTheme();
        alert(`Saved preset: ${presetName}`);
    });
}

if (updatePresetBtn) {
    updatePresetBtn.addEventListener('click', async () => {
        const presetName = themePresetSelect.value;
        if (!presetName || protectedPresets.includes(presetName) || !macrosData.theme_presets[presetName]) {
            return;
        }
        
        if (!macrosData.theme) macrosData.theme = {};
        macrosData.theme_presets[presetName] = JSON.parse(JSON.stringify(macrosData.theme));
        
        await syncAndSaveTheme();
        alert(`Updated preset: ${presetName}`);
    });
}

if (deletePresetBtn) {
    deletePresetBtn.addEventListener('click', async () => {
        const presetName = themePresetSelect.value;
        if (!presetName || !macrosData.theme_presets || !macrosData.theme_presets[presetName]) {
            return;
        }
        
        if (protectedPresets.includes(presetName)) {
            alert('Cannot delete built-in presets');
            return;
        }
        
        if (confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
            delete macrosData.theme_presets[presetName];
            
            for(let i=0; i<themePresetSelect.options.length; i++) {
                if(themePresetSelect.options[i].value === presetName) {
                    themePresetSelect.remove(i);
                    break;
                }
            }
            themePresetSelect.value = '';
            deletePresetBtn.style.display = 'none';
            if (updatePresetBtn) updatePresetBtn.style.display = 'none';
            
            await syncAndSaveTheme();
            alert(`Deleted preset: ${presetName}`);
        }
    });
}
