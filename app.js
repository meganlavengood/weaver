// DOM Elements
const canvas = document.getElementById('weavingCanvas');
const ctx = canvas.getContext('2d');
const warpThreadsInput = document.getElementById('warpThreads');
const weftThreadsInput = document.getElementById('weftThreads');
const patternSelect = document.getElementById('pattern');
const patternSettingsContainer = document.getElementById('patternSettingsContainer');
const downloadBtn = document.getElementById('downloadBtn');
const resetViewBtn = document.getElementById('resetViewBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');

const warpColorsContainer = document.getElementById('warpColorsContainer');
const addWarpColorBtn = document.getElementById('addWarpColorBtn');
const weftColorsContainer = document.getElementById('weftColorsContainer');
const addWeftColorBtn = document.getElementById('addWeftColorBtn');

const warpRepeatSelect = document.getElementById('warpRepeat');
const weftRepeatSelect = document.getElementById('weftRepeat');
const currentPaletteContainer = document.getElementById('currentPaletteContainer');
const addPaletteColorBtn = document.getElementById('addPaletteColorBtn');
const paletteTypeSelect = document.getElementById('paletteType');

// Mobile Menu Elements
const menuToggleBtn = document.getElementById('menuToggleBtn');
const controlsPanel = document.getElementById('controlsPanel');
const menuBackdrop = document.getElementById('menuBackdrop');

// Modal Elements
const aboutBtn = document.getElementById('aboutIconBtn');
const aboutModal = document.getElementById('aboutModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const tutorialModal = document.getElementById('tutorialModal');
const closeTutorialBtn = document.getElementById('closeTutorialBtn');
const dontShowTutorialCheckbox = document.getElementById('dontShowTutorialCheckbox');
const tutorialGotItBtn = document.getElementById('tutorialGotItBtn');

// Canvas transform state
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let lastX = 0;
let lastY = 0;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 20;
const BASE_CELL_SIZE = 20;

// --- PATTERN GENERATION LOGIC ---
function generatePlainWeave(warpCount, weftCount) {
    const matrix = [];
    for (let i = 0; i < weftCount; i++) {
        const row = [];
        for (let j = 0; j < warpCount; j++) {
            row.push((i + j) % 2 === 0 ? 1 : 0);
        }
        matrix.push(row);
    }
    return matrix;
}

function generateTwill(warpCount, weftCount, over, under) {
    const step = over + under;
    if (step === 0) return generatePlainWeave(warpCount, weftCount);
    const matrix = [];
    for (let i = 0; i < weftCount; i++) {
        const row = [];
        for (let j = 0; j < warpCount; j++) {
            row.push((j - i + warpCount * weftCount) % step < over ? 1 : 0);
        }
        matrix.push(row);
    }
    return matrix;
}

function generateSatin(warpCount, weftCount, harness) {
    if (harness < 2) harness = 2;
    const step = 2;
    const matrix = [];
    for (let i = 0; i < weftCount; i++) {
        const row = [];
        const floatStart = (i * step) % harness;
        for (let j = 0; j < warpCount; j++) {
            row.push(j % harness === floatStart ? 1 : 0);
        }
        matrix.push(row);
    }
    return matrix;
}

function generateBasketWeave(warpCount, weftCount, size) {
    if (size < 1) size = 1;
    const matrix = [];
    for (let i = 0; i < weftCount; i++) {
        const row = [];
        for (let j = 0; j < warpCount; j++) {
            const isRowOver = Math.floor(i / size) % 2 === 0;
            const isColOver = Math.floor(j / size) % 2 === 0;
            row.push(isRowOver === isColOver ? 1 : 0);
        }
        matrix.push(row);
    }
    return matrix;
}

function expandSett(sett) {
    const sequence = [];
    sett.forEach(item => {
        for (let i = 0; i < item.count; i++) {
            sequence.push(item.color);
        }
    });
    return sequence;
}

function expandColorSequence(colors, mode, length) {
    if (!colors || colors.length === 0) return Array(length).fill('#888888');
    const n = colors.length;
    let sequence = [];

    if (mode === 'simple') {
        sequence = colors;
    } else if (mode === 'point') {
        sequence = [...colors];
        if (n > 1) sequence.push(...colors.slice(0, -1).reverse());
    } else if (mode === 'mirror') {
        sequence = [...colors, ...[...colors].reverse()];
    }

    if (sequence.length === 0) return Array(length).fill('#888888');
    const expanded = [];
    for (let i = 0; i < length; i++) {
        expanded.push(sequence[i % sequence.length]);
    }
    return expanded;
}

// --- UI & DRAWING LOGIC ---
function updatePatternSettingsUI() {
    const patternType = patternSelect.value;
    patternSettingsContainer.innerHTML = '';

    const createInput = (id, label, value, min = 1, max = 20) => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label for="${id}" class="block text-sm font-medium text-stone-700 mb-1">${label}</label>
            <input type="number" id="${id}" value="${value}" min="${min}" max="${max}" class="form-input w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-md shadow-sm">
        `;
        div.querySelector('input').addEventListener('input', () => handleUIDrivenUpdate());
        return div;
    };

    switch (patternType) {
        case 'twill':
            patternSettingsContainer.appendChild(createInput('twillOver', 'Over', 2));
            patternSettingsContainer.appendChild(createInput('twillUnder', 'Under', 1));
            break;
        case 'satin':
            patternSettingsContainer.appendChild(createInput('satinHarness', 'Harness', 5, 3));
            break;
        case 'basket':
            patternSettingsContainer.appendChild(createInput('basketSize', 'Block Size', 2, 2));
            break;
        case 'tartan':
        case 'plain':
            break;
    }
    const accordionContent = patternSettingsContainer.closest('.accordion-content');
    if (accordionContent && accordionContent.style.maxHeight) {
        requestAnimationFrame(() => {
            accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
        });
    }
}

let patternMatrix = [];
let expandedWarpColors = [];
let expandedWeftColors = [];

function getSettFromUI(container) {
    const colorEntries = container.querySelectorAll('.color-entry-wrapper');
    return Array.from(colorEntries).map(entry => {
        return {
            color: entry.querySelector('input[type="color"]').value,
            count: parseInt(entry.querySelector('input[type="number"]').value) || 1
        };
    });
}

function regenerateData() {
    const warpCount = parseInt(warpThreadsInput.value);
    const weftCount = parseInt(weftThreadsInput.value);
    const patternType = patternSelect.value;

    const warpRepeatMode = warpRepeatSelect.value;
    const weftRepeatMode = weftRepeatSelect.value;

    const warpSett = getSettFromUI(warpColorsContainer);
    const weftSett = getSettFromUI(weftColorsContainer);

    const parsedWarpColors = expandSett(warpSett);
    const parsedWeftColors = expandSett(weftSett);

    expandedWarpColors = expandColorSequence(parsedWarpColors, warpRepeatMode, warpCount);
    expandedWeftColors = expandColorSequence(parsedWeftColors, weftRepeatMode, weftCount);

    switch(patternType) {
        case 'tartan':
            patternMatrix = generateTwill(warpCount, weftCount, 2, 2);
            break;
        case 'plain':
            patternMatrix = generatePlainWeave(warpCount, weftCount);
            break;
        case 'twill': {
            const over = parseInt(document.getElementById('twillOver')?.value || 2);
            const under = parseInt(document.getElementById('twillUnder')?.value || 1);
            patternMatrix = generateTwill(warpCount, weftCount, over, under);
            break;
        }
        case 'satin': {
            const harness = parseInt(document.getElementById('satinHarness')?.value || 5);
            patternMatrix = generateSatin(warpCount, weftCount, harness);
            break;
        }
        case 'basket': {
            const size = parseInt(document.getElementById('basketSize')?.value || 2);
            patternMatrix = generateBasketWeave(warpCount, weftCount, size);
            break;
        }
        default: patternMatrix = generatePlainWeave(warpCount, weftCount);
    }
}

function fitToView() {
    const warpCount = parseInt(warpThreadsInput.value);
    if (warpCount === 0 || canvas.width === 0) return;

    const patternPixelWidth = warpCount * BASE_CELL_SIZE;
    zoom = (canvas.width / patternPixelWidth) * 0.9;

    const patternPixelHeight = parseInt(weftThreadsInput.value) * BASE_CELL_SIZE;
    if (patternPixelHeight * zoom > canvas.height) {
        zoom = (canvas.height / patternPixelHeight) * 0.9;
    }
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    const patternWidth = warpCount * BASE_CELL_SIZE * zoom;
    const patternHeight = parseInt(weftThreadsInput.value) * BASE_CELL_SIZE * zoom;
    offsetX = (canvas.width - patternWidth) / 2;
    offsetY = (canvas.height - patternHeight) / 2;
}

function drawPattern() {
    const warpCount = parseInt(warpThreadsInput.value);
    const weftCount = parseInt(weftThreadsInput.value);
    const cellSize = BASE_CELL_SIZE * zoom;

    if (canvas.width === 0 || canvas.height === 0) return;

    ctx.save();
    ctx.fillStyle = '#f5f5f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(offsetX, offsetY);

    if (!patternMatrix || patternMatrix.length === 0) return;

    const startY = Math.floor(-offsetY / cellSize);
    const endY = Math.ceil((canvas.height - offsetY) / cellSize);
    const startX = Math.floor(-offsetX / cellSize);
    const endX = Math.ceil((canvas.width - offsetX) / cellSize);

    for (let i = Math.max(0, startY); i < Math.min(weftCount, endY); i++) {
        for (let j = Math.max(0, startX); j < Math.min(warpCount, endX); j++) {
            if (patternMatrix[i][j] === 1) {
                ctx.fillStyle = expandedWarpColors[j];
            } else {
                ctx.fillStyle = expandedWeftColors[i];
            }
            ctx.fillRect(j * cellSize, i * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
    }

    ctx.restore();
}

function updateColorNumbers(container) {
    const colorEntries = container.querySelectorAll('.color-entry-wrapper');
    colorEntries.forEach((entry, index) => {
        let numberSpan = entry.querySelector('.color-number');
        if (!numberSpan) {
            numberSpan = document.createElement('span');
            numberSpan.className = 'text-xs font-mono text-stone-500 w-6 text-center color-number flex-shrink-0';
            entry.insertBefore(numberSpan, entry.firstChild);
        }
        numberSpan.textContent = `${index + 1}.`;
    });
}

function createColorPicker(container, colorValue = '#cccccc', countValue = 12) {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative flex items-center group color-entry-wrapper gap-2 p-1 rounded-md hover:bg-stone-100 w-full';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle flex-shrink-0 text-stone-400 hover:text-stone-600 cursor-grab px-0.5';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = colorValue;

    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.value = countValue;
    countInput.min = 1;
    countInput.max = 500;
    countInput.className = "w-14 text-sm text-center form-input px-1 py-1 bg-white border border-stone-300 rounded-md shadow-sm";
    countInput.setAttribute('aria-label', 'Thread count');

    const duplicateBtn = document.createElement('button');
    duplicateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>`;
    duplicateBtn.className = 'text-stone-400 hover:text-teal-600 hover:bg-teal-100 rounded-full p-0.5 transition-colors';
    duplicateBtn.setAttribute('aria-label', 'Duplicate color');

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.647 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>`;
    removeBtn.className = 'ml-auto text-stone-400 hover:text-red-600 hover:bg-red-100 rounded-full p-0.5 transition-colors';
    removeBtn.setAttribute('aria-label', 'Remove color');

    colorInput.addEventListener('input', () => handleUIDrivenUpdate());
    countInput.addEventListener('input', () => handleUIDrivenUpdate());
    duplicateBtn.addEventListener('click', () => {
        createColorPicker(container, colorInput.value, parseInt(countInput.value) || 1);
        wrapper.insertAdjacentElement('afterend', container.lastElementChild);
        updateColorNumbers(container);
        const accordionContent = wrapper.closest('.accordion-content');
        if (accordionContent && accordionContent.style.maxHeight) {
            accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
        }
        handleUIDrivenUpdate();
    });
    removeBtn.addEventListener('click', () => {
        const accordionContent = wrapper.closest('.accordion-content');
        wrapper.remove();
        updateColorNumbers(container);
        if (accordionContent && accordionContent.style.maxHeight) {
            accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
        }
        handleUIDrivenUpdate();
    });

    wrapper.appendChild(dragHandle);
    wrapper.appendChild(colorInput);
    wrapper.appendChild(countInput);
    wrapper.appendChild(duplicateBtn);
    wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
}

// --- EVENT LISTENERS & ACTIONS ---
function handleUIDrivenUpdate(shouldFitView = false) {
    const container = canvas.parentElement;
    if (container.clientWidth > 0 && container.clientHeight > 0) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    regenerateData();

    if (shouldFitView) {
        fitToView();
    }

    drawPattern();

    const warpSum = getSettFromUI(warpColorsContainer).reduce((acc, e) => acc + e.count, 0);
    document.getElementById('warpSettSum').textContent = `(${warpSum})`;
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function parseInputWithFallback(inputId, fallbackType) {
    const input = document.getElementById(inputId);
    let value = parseInt(input.value, 10);
    if (isNaN(value) || input.value.trim() === '') {
        value = parseInt(input.getAttribute('placeholder'), 10) || (input[fallbackType] ? parseInt(input[fallbackType], 10) : NaN);
    }

    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);

    if (!isNaN(min) && value < min) {
        value = min;
    }
    if (!isNaN(max) && value > max) {
        value = max;
    }

    return value;
}

function setupMinMaxValidation() {
    const fields = [
        ['minPaletteSize', 'maxPaletteSize'],
        ['minSettEntries', 'maxSettEntries'],
        ['minThreads', 'maxThreads']
    ];

    fields.forEach(([minId, maxId]) => {
        const minInput = document.getElementById(minId);
        const maxInput = document.getElementById(maxId);

        minInput.addEventListener('change', () => {
            const minValue = parseInt(minInput.value);
            const maxValue = parseInt(maxInput.value);
            if (!isNaN(minValue) && !isNaN(maxValue) && minValue > maxValue) {
                minInput.value = maxValue;
            }
        });

        maxInput.addEventListener('change', () => {
            const minValue = parseInt(minInput.value);
            const maxValue = parseInt(maxInput.value);
            if (!isNaN(minValue) && !isNaN(maxValue) && maxValue < minValue) {
                maxInput.value = minValue;
            }
        });
    });
}

function createEditablePaletteSwatch(color) {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative group';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = color;

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-x-lg text-white" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>`;
    removeBtn.className = 'absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100';
    removeBtn.setAttribute('aria-label', 'Remove color');

    removeBtn.addEventListener('click', () => {
        wrapper.remove();
    });

    let oldColor = color;
    colorInput.addEventListener('input', () => {
        if (paletteTypeSelect.value !== 'custom') return;
        const newColor = colorInput.value;

        const allSettInputs = [
            ...warpColorsContainer.querySelectorAll('.color-entry-wrapper input[type="color"]'),
            ...weftColorsContainer.querySelectorAll('.color-entry-wrapper input[type="color"]')
        ];
        allSettInputs.forEach(input => {
            if (input.value === oldColor) {
                input.value = newColor;
            }
        });

        oldColor = newColor;
        handleUIDrivenUpdate();
    });

    wrapper.appendChild(colorInput);
    if (paletteTypeSelect.value === 'custom') {
        wrapper.appendChild(removeBtn);
    } else {
        colorInput.disabled = true;
    }
    currentPaletteContainer.appendChild(wrapper);
}

function updateCurrentPaletteUI(palette) {
    currentPaletteContainer.innerHTML = '';
    palette.forEach(color => createEditablePaletteSwatch(color));

    const isCustom = paletteTypeSelect.value === 'custom';
    addPaletteColorBtn.classList.toggle('hidden', !isCustom);

    const accordionContent = paletteTypeSelect.closest('.accordion-content');
    if (accordionContent && accordionContent.style.maxHeight) {
        accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
    }
}

function generateHarmonizedPalette() {
    const paletteType = paletteTypeSelect.value;

    const minPaletteSize = parseInputWithFallback('minPaletteSize', 'min');
    const maxPaletteSize = parseInputWithFallback('maxPaletteSize', 'max');
    const paletteSize = Math.floor(Math.random() * (maxPaletteSize - minPaletteSize + 1)) + minPaletteSize;

    const palette = [];
    const baseHue = Math.random() * 360;
    let hues = [baseHue];

    switch (paletteType) {
        case 'analogous':
            for (let i = 1; i < paletteSize; i++) hues.push((baseHue + (Math.random() - 0.5) * 60 + 360) % 360);
            break;
        case 'complementary':
            if (paletteSize > 1) hues.push((baseHue + 180) % 360);
            for (let i = 2; i < paletteSize; i++) hues.push((hues[Math.floor(Math.random()*hues.length)] + (Math.random() - 0.5) * 45 + 360) % 360);
            break;
        case 'split_complementary':
            if (paletteSize > 1) hues.push((baseHue + 150) % 360);
            if (paletteSize > 2) hues.push((baseHue + 210) % 360);
            for (let i = 3; i < paletteSize; i++) hues.push((hues[Math.floor(Math.random()*hues.length)] + (Math.random() - 0.5) * 30 + 360) % 360);
            break;
        case 'triadic':
            if (paletteSize > 1) hues.push((baseHue + 120) % 360);
            if (paletteSize > 2) hues.push((baseHue + 240) % 360);
            for (let i = 3; i < paletteSize; i++) hues.push((hues[Math.floor(Math.random()*hues.length)] + (Math.random() - 0.5) * 30 + 360) % 360);
            break;
        case 'custom':
        case 'random':
        default:
            for (let i = 1; i < paletteSize; i++) hues.push(Math.random() * 360);
            break;
    }

    hues = hues.slice(0, paletteSize);

    for (let i = 0; i < paletteSize; i++) {
        const hue = hues[i % hues.length];
        const sat = Math.floor(Math.random() * 30) + 50;
        const light = Math.floor(Math.random() * 30) + 40;
        palette.push(hslToHex(hue, sat, light));
    }
    return palette;
}

function generateRandomPattern() {
    const minSettEntries = parseInputWithFallback('minSettEntries', 'min');
    const maxSettEntries = parseInputWithFallback('maxSettEntries', 'max');
    const minThreads = parseInputWithFallback('minThreads', 'min');
    const maxThreads = parseInputWithFallback('maxThreads', 'max');
    const numEntries = Math.floor(Math.random() * (maxSettEntries - minSettEntries + 1)) + minSettEntries;

    const patternTypes = ['plain', 'twill', 'satin', 'basket', 'tartan'];
    const newPatternType = patternTypes[Math.floor(Math.random() * patternTypes.length)];
    patternSelect.value = newPatternType;

    updatePatternSettingsUI();

    switch (newPatternType) {
        case 'twill': {
            const over = Math.floor(Math.random() * 4) + 2;
            const under = Math.floor(Math.random() * 3) + 1;
            document.getElementById('twillOver').value = over;
            document.getElementById('twillUnder').value = under;
            break;
        }
        case 'satin': {
            const harnessOptions = [5, 7, 8];
            const harness = harnessOptions[Math.floor(Math.random() * harnessOptions.length)];
            document.getElementById('satinHarness').value = harness;
            break;
        }
        case 'basket': {
            const size = Math.floor(Math.random() * 3) + 2;
            document.getElementById('basketSize').value = size;
            break;
        }
    }

    const generateSettFromPalette = (palette, numEntries, minThreads, maxThreads) => {
        if (palette.length === 0) return [];
        const sett = [];
        let lastColor = null;

        const requiredColors = [...palette].sort(() => 0.5 - Math.random());

        for (let i = 0; i < numEntries; i++) {
            let nextColor;
            if (requiredColors.length > 0) {
                nextColor = requiredColors.pop();
                if (nextColor === lastColor && requiredColors.length > 0) {
                    requiredColors.unshift(nextColor);
                    nextColor = requiredColors.pop();
                }
            }

            if (!nextColor || nextColor === lastColor) {
                const availableColors = palette.filter(c => c !== lastColor);
                if (availableColors.length > 0) {
                    nextColor = availableColors[Math.floor(Math.random() * availableColors.length)];
                } else {
                    nextColor = palette[0];
                }
            }

            sett.push({
                color: nextColor,
                count: Math.floor(Math.random() * (maxThreads - minThreads + 1)) + minThreads
            });
            lastColor = nextColor;
        }
        return sett;
    };

    warpColorsContainer.innerHTML = '';
    weftColorsContainer.innerHTML = '';

    let colorPalette;
    if (paletteTypeSelect.value === 'custom') {
        const customColorInputs = currentPaletteContainer.querySelectorAll('input[type="color"]');
        colorPalette = Array.from(customColorInputs).map(input => input.value);
        if (colorPalette.length === 0) {
            colorPalette = ['#cc0000', '#00cc00', '#0000cc'];
        }
    } else {
        colorPalette = generateHarmonizedPalette();
    }
    updateCurrentPaletteUI(colorPalette);

    const warpSett = generateSettFromPalette(colorPalette, numEntries, minThreads, maxThreads);
    const weftSett = Math.random() > 0.5 ? warpSett : generateSettFromPalette(colorPalette, numEntries, minThreads, maxThreads);

    warpSett.forEach(p => createColorPicker(warpColorsContainer, p.color, p.count));
    updateColorNumbers(warpColorsContainer);
    weftSett.forEach(p => createColorPicker(weftColorsContainer, p.color, p.count));
    updateColorNumbers(weftColorsContainer);

    const repeatTypes = ['simple', 'point', 'mirror'];
    warpRepeatSelect.value = repeatTypes[Math.floor(Math.random() * repeatTypes.length)];
    weftRepeatSelect.value = repeatTypes[Math.floor(Math.random() * repeatTypes.length)];

    handleUIDrivenUpdate(true);
}

// --- GLOBAL EVENT LISTENERS ---
function toggleMenu() {
    controlsPanel.classList.toggle('-translate-x-full');
    const isHidden = menuBackdrop.classList.toggle('hidden');
    document.body.style.overflow = isHidden ? '' : 'hidden';
    setTimeout(() => handleUIDrivenUpdate(true), 50);
}

menuToggleBtn.addEventListener('click', toggleMenu);
menuBackdrop.addEventListener('click', toggleMenu);

warpThreadsInput.addEventListener('input', () => handleUIDrivenUpdate(true));
weftThreadsInput.addEventListener('input', () => handleUIDrivenUpdate(true));
warpRepeatSelect.addEventListener('input', () => handleUIDrivenUpdate());
weftRepeatSelect.addEventListener('input', () => handleUIDrivenUpdate());

patternSelect.addEventListener('change', () => { updatePatternSettingsUI(); handleUIDrivenUpdate(); });
addWarpColorBtn.addEventListener('click', () => {
    createColorPicker(warpColorsContainer);
    updateColorNumbers(warpColorsContainer);
    const accordionContent = warpColorsContainer.closest('.accordion-content');
    if (accordionContent && accordionContent.style.maxHeight) {
        accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
    }
    handleUIDrivenUpdate();
});
addWeftColorBtn.addEventListener('click', () => {
    createColorPicker(weftColorsContainer);
    updateColorNumbers(weftColorsContainer);
    const accordionContent = weftColorsContainer.closest('.accordion-content');
    if (accordionContent && accordionContent.style.maxHeight) {
        accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
    }
    handleUIDrivenUpdate();
});

addPaletteColorBtn.addEventListener('click', () => {
    createEditablePaletteSwatch('#888888');
    updateCurrentPaletteUI(Array.from(currentPaletteContainer.querySelectorAll('input[type="color"]')).map(i => i.value));
});

paletteTypeSelect.addEventListener('change', (e) => {
    const isCustom = e.target.value === 'custom';
    if (isCustom) {
        updateCurrentPaletteUI(Array.from(currentPaletteContainer.querySelectorAll('input[type="color"]')).map(i => i.value));
    } else {
        updateCurrentPaletteUI(generateHarmonizedPalette());
    }
});

downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `weaving-pattern-${patternSelect.value}.png`;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const warpCount = parseInt(warpThreadsInput.value);
    const weftCount = parseInt(weftThreadsInput.value);
    tempCanvas.width = warpCount * BASE_CELL_SIZE;
    tempCanvas.height = weftCount * BASE_CELL_SIZE;

    regenerateData();

    for (let i = 0; i < weftCount; i++) {
        for (let j = 0; j < warpCount; j++) {
            if (patternMatrix[i][j] === 1) tempCtx.fillStyle = expandedWarpColors[j];
            else tempCtx.fillStyle = expandedWeftColors[i];
            tempCtx.fillRect(j * BASE_CELL_SIZE, i * BASE_CELL_SIZE, BASE_CELL_SIZE, BASE_CELL_SIZE);
        }
    }
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
});

resetViewBtn.addEventListener('click', () => { handleUIDrivenUpdate(true); });
randomizeBtn.addEventListener('click', generateRandomPattern);

function exportPattern() {
    const state = {
        version: 1,
        warpThreads: parseInt(warpThreadsInput.value),
        weftThreads: parseInt(weftThreadsInput.value),
        pattern: patternSelect.value,
        patternSettings: {},
        warpSett: getSettFromUI(warpColorsContainer),
        weftSett: getSettFromUI(weftColorsContainer),
        warpRepeat: warpRepeatSelect.value,
        weftRepeat: weftRepeatSelect.value,
        paletteType: paletteTypeSelect.value,
        palette: Array.from(currentPaletteContainer.querySelectorAll('input[type="color"]')).map(i => i.value),
        randomizerSettings: {
            minPaletteSize: parseInt(document.getElementById('minPaletteSize').value),
            maxPaletteSize: parseInt(document.getElementById('maxPaletteSize').value),
            minSettEntries: parseInt(document.getElementById('minSettEntries').value),
            maxSettEntries: parseInt(document.getElementById('maxSettEntries').value),
            minThreads: parseInt(document.getElementById('minThreads').value),
            maxThreads: parseInt(document.getElementById('maxThreads').value),
        }
    };

    switch (state.pattern) {
        case 'twill':
            state.patternSettings.twillOver = parseInt(document.getElementById('twillOver')?.value || 2);
            state.patternSettings.twillUnder = parseInt(document.getElementById('twillUnder')?.value || 1);
            break;
        case 'satin':
            state.patternSettings.satinHarness = parseInt(document.getElementById('satinHarness')?.value || 5);
            break;
        case 'basket':
            state.patternSettings.basketSize = parseInt(document.getElementById('basketSize')?.value || 2);
            break;
    }

    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `weaving-pattern-${state.pattern}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
}

function importPattern(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);

            warpThreadsInput.value = state.warpThreads;
            weftThreadsInput.value = state.weftThreads;

            patternSelect.value = state.pattern;
            updatePatternSettingsUI();

            if (state.patternSettings) {
                const ps = state.patternSettings;
                if (ps.twillOver != null && document.getElementById('twillOver')) document.getElementById('twillOver').value = ps.twillOver;
                if (ps.twillUnder != null && document.getElementById('twillUnder')) document.getElementById('twillUnder').value = ps.twillUnder;
                if (ps.satinHarness != null && document.getElementById('satinHarness')) document.getElementById('satinHarness').value = ps.satinHarness;
                if (ps.basketSize != null && document.getElementById('basketSize')) document.getElementById('basketSize').value = ps.basketSize;
            }

            warpColorsContainer.innerHTML = '';
            weftColorsContainer.innerHTML = '';
            (state.warpSett || []).forEach(p => createColorPicker(warpColorsContainer, p.color, p.count));
            updateColorNumbers(warpColorsContainer);
            (state.weftSett || []).forEach(p => createColorPicker(weftColorsContainer, p.color, p.count));
            updateColorNumbers(weftColorsContainer);

            warpRepeatSelect.value = state.warpRepeat || 'simple';
            weftRepeatSelect.value = state.weftRepeat || 'simple';

            paletteTypeSelect.value = state.paletteType || 'complementary';
            updateCurrentPaletteUI(state.palette || []);

            if (state.randomizerSettings) {
                const rs = state.randomizerSettings;
                if (rs.minPaletteSize != null) document.getElementById('minPaletteSize').value = rs.minPaletteSize;
                if (rs.maxPaletteSize != null) document.getElementById('maxPaletteSize').value = rs.maxPaletteSize;
                if (rs.minSettEntries != null) document.getElementById('minSettEntries').value = rs.minSettEntries;
                if (rs.maxSettEntries != null) document.getElementById('maxSettEntries').value = rs.maxSettEntries;
                if (rs.minThreads != null) document.getElementById('minThreads').value = rs.minThreads;
                if (rs.maxThreads != null) document.getElementById('maxThreads').value = rs.maxThreads;
            }

            handleUIDrivenUpdate(true);
        } catch {
            alert('Failed to import: the file is not a valid Weaver\'s Canvas JSON.');
        }
    };
    reader.readAsText(file);
}

exportBtn.addEventListener('click', exportPattern);
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        importPattern(e.target.files[0]);
        importFileInput.value = '';
    }
});

canvas.addEventListener('mousedown', (e) => { isPanning = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    drawPattern();
});
canvas.addEventListener('mouseup', () => isPanning = false);
canvas.addEventListener('mouseleave', () => isPanning = false);
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = 1.1;
    const oldZoom = zoom;
    if (e.deltaY < 0) zoom = Math.min(MAX_ZOOM, zoom * zoomFactor);
    else zoom = Math.max(MIN_ZOOM, zoom / zoomFactor);
    offsetX = mouseX - (mouseX - offsetX) * (zoom / oldZoom);
    offsetY = mouseY - (mouseY - offsetY) * (zoom / oldZoom);
    drawPattern();
});

aboutBtn.addEventListener('click', () => {
    aboutModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    aboutModal.classList.add('hidden');
});

aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) {
        aboutModal.classList.add('hidden');
    }
});

function closeTutorial() {
    if (dontShowTutorialCheckbox.checked) {
        localStorage.setItem('showTutorial', 'false');
    }
    tutorialModal.classList.add('hidden');
}

closeTutorialBtn.addEventListener('click', closeTutorial);
tutorialGotItBtn.addEventListener('click', closeTutorial);

tutorialModal.addEventListener('click', (e) => {
    if (e.target === tutorialModal) {
        closeTutorial();
    }
});

function initSortable(container) {
    Sortable.create(container, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: () => {
            updateColorNumbers(container);
            handleUIDrivenUpdate();
        }
    });
}

window.addEventListener('load', () => {
    initSortable(warpColorsContainer);
    initSortable(weftColorsContainer);

    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const svg = header.querySelector('svg');

            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                svg.style.transform = 'rotate(0deg)';
            } else {
                document.querySelectorAll('.accordion-content').forEach(c => {
                    c.style.maxHeight = null;
                    c.previousElementSibling.querySelector('svg').style.transform = 'rotate(0deg)';
                });

                content.style.maxHeight = content.scrollHeight + "px";
                svg.style.transform = 'rotate(180deg)';
            }
        });
    });

    setupMinMaxValidation();
    generateRandomPattern();

    if (localStorage.getItem('showTutorial') !== 'false') {
        tutorialModal.classList.remove('hidden');
    }
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        handleUIDrivenUpdate(true);
    }, 100);
});
