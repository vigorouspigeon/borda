// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const previewCanvas = document.getElementById('previewCanvas');
const sizeSlider = document.getElementById('sizeSlider');
let sizeValue = document.getElementById('sizeValue');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const newPhotoBtn = document.getElementById('newPhotoBtn');
const ratioButtons = document.querySelectorAll('.ratio-btn');

// State
let currentImage = null;
let currentRatio = '9:16';
let currentSize = 95;

// Mode & collage state
let currentMode = 'single'; // 'single' or 'collage'
let currentLayout = '2h';
let collageImages = []; // array of Image objects (or null for empty slots)
let collageOffsets = []; // per-image {x, y} offsets, -1 to 1
let collageSizes = []; // per-image size overrides (25-100)

const LAYOUTS = {
    '2h':  [{x:0, y:0, w:0.5, h:1},   {x:0.5, y:0, w:0.5, h:1}],
    '2v':  [{x:0, y:0, w:1, h:0.5},    {x:0, y:0.5, w:1, h:0.5}],
    '3l':  [{x:0, y:0, w:0.5, h:1},    {x:0.5, y:0, w:0.5, h:0.5}, {x:0.5, y:0.5, w:0.5, h:0.5}],
    '3r':  [{x:0, y:0, w:0.5, h:0.5},  {x:0, y:0.5, w:0.5, h:0.5}, {x:0.5, y:0, w:0.5, h:1}],
    '4':   [{x:0, y:0, w:0.5, h:0.5},  {x:0.5, y:0, w:0.5, h:0.5}, {x:0, y:0.5, w:0.5, h:0.5}, {x:0.5, y:0.5, w:0.5, h:0.5}]
};

// Pan/drag state
let offsetX = 0; // -1 to 1 range, 0 = centered
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
let dragCellIndex = -1; // which collage cell is being dragged (-1 = single mode)

// Animation state
let displayedRatio = 9/16;
let targetRatio = 9/16;
let animationId = null;
let animationStart = null;
const ANIMATION_DURATION = 450;

// Last computed cell rects for hit testing (in canvas pixel coords)
let lastCellRects = [];

function parseRatio(ratioStr) {
    const [width, height] = ratioStr.split(':').map(Number);
    return width / height;
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Initialize
function init() {
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    ratioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRatio = btn.dataset.ratio;
            animateToRatio(parseRatio(currentRatio));
        });
    });

    sizeSlider.addEventListener('input', (e) => {
        currentSize = parseInt(e.target.value);
        sizeValue.textContent = currentSize;
        renderPreview(displayedRatio);
    });

    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setMode(btn.dataset.mode);
        });
    });

    // Layout buttons
    document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayout = btn.dataset.layout;
            renderCollageSlots();
            renderPreview(displayedRatio);
        });
    });

    downloadBtn.addEventListener('click', downloadImage);
    shareBtn.addEventListener('click', shareImage);
    newPhotoBtn.addEventListener('click', resetApp);

    // Reset position button
    document.getElementById('resetPositionBtn').addEventListener('click', resetPosition);

    // Canvas drag events (mouse)
    previewCanvas.addEventListener('mousedown', dragStart);
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('mouseup', dragEnd);

    // Canvas drag events (touch)
    previewCanvas.addEventListener('touchstart', dragStart, { passive: false });
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('touchend', dragEnd);

    // Double-click/tap to reset position
    previewCanvas.addEventListener('dblclick', handleDblClick);
}

function getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

// Convert a screen point to canvas-pixel coordinates
function screenToCanvas(clientX, clientY) {
    const rect = previewCanvas.getBoundingClientRect();
    const scaleX = previewCanvas.width / rect.width;
    const scaleY = previewCanvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// Find which collage cell a canvas-pixel point is inside
function hitTestCell(canvasX, canvasY) {
    for (let i = lastCellRects.length - 1; i >= 0; i--) {
        const r = lastCellRects[i];
        if (canvasX >= r.px && canvasX <= r.px + r.pw && canvasY >= r.py && canvasY <= r.py + r.ph) {
            return i;
        }
    }
    return -1;
}

function dragStart(e) {
    if (currentMode === 'single') {
        if (!currentImage) return;
        e.preventDefault();
        isDragging = true;
        dragCellIndex = -1;
        const pos = getPointerPos(e);
        dragStartX = pos.x;
        dragStartY = pos.y;
        dragStartOffsetX = offsetX;
        dragStartOffsetY = offsetY;
        previewCanvas.classList.add('dragging');
    } else {
        // Collage mode — find which cell was tapped
        const pos = getPointerPos(e);
        const cp = screenToCanvas(pos.x, pos.y);
        const cellIdx = hitTestCell(cp.x, cp.y);
        if (cellIdx === -1 || !collageImages[cellIdx]) return;
        e.preventDefault();
        isDragging = true;
        dragCellIndex = cellIdx;
        dragStartX = pos.x;
        dragStartY = pos.y;
        const off = collageOffsets[cellIdx] || { x: 0, y: 0 };
        dragStartOffsetX = off.x;
        dragStartOffsetY = off.y;
        previewCanvas.classList.add('dragging');
    }
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const rect = previewCanvas.getBoundingClientRect();
    const deltaX = (pos.x - dragStartX) / rect.width * 2;
    const deltaY = (pos.y - dragStartY) / rect.height * 2;

    if (currentMode === 'single') {
        offsetX = Math.max(-1, Math.min(1, dragStartOffsetX + deltaX));
        offsetY = Math.max(-1, Math.min(1, dragStartOffsetY + deltaY));
        updateResetButtonVisibility();
    } else if (dragCellIndex >= 0) {
        if (!collageOffsets[dragCellIndex]) collageOffsets[dragCellIndex] = { x: 0, y: 0 };
        collageOffsets[dragCellIndex].x = Math.max(-1, Math.min(1, dragStartOffsetX + deltaX));
        collageOffsets[dragCellIndex].y = Math.max(-1, Math.min(1, dragStartOffsetY + deltaY));
    }
    renderPreview(displayedRatio);
}

function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    dragCellIndex = -1;
    previewCanvas.classList.remove('dragging');
}

function handleDblClick(e) {
    if (currentMode === 'single') {
        resetPosition();
    } else {
        // Reset the tapped collage cell
        const pos = getPointerPos(e);
        const cp = screenToCanvas(pos.x, pos.y);
        const cellIdx = hitTestCell(cp.x, cp.y);
        if (cellIdx >= 0 && collageOffsets[cellIdx]) {
            collageOffsets[cellIdx] = { x: 0, y: 0 };
            renderPreview(displayedRatio);
        }
    }
}

function resetPosition() {
    if (currentMode === 'collage') {
        // Reset all collage offsets
        collageOffsets = [];
        renderPreview(displayedRatio);
        return;
    }
    offsetX = 0;
    offsetY = 0;
    updateResetButtonVisibility();
    renderPreview(displayedRatio);
}

function updateResetButtonVisibility() {
    const btn = document.getElementById('resetPositionBtn');
    if (currentMode === 'single') {
        btn.classList.toggle('visible', offsetX !== 0 || offsetY !== 0);
    } else {
        const hasOffsets = collageOffsets.some(o => o && (o.x !== 0 || o.y !== 0));
        btn.classList.toggle('visible', hasOffsets);
    }
}

// Animate to a new ratio
function animateToRatio(newTargetRatio) {
    if (animationId) cancelAnimationFrame(animationId);
    targetRatio = newTargetRatio;
    animationStart = performance.now();
    const startRatio = displayedRatio;

    function animate(currentTime) {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutCubic(progress);
        displayedRatio = startRatio + (targetRatio - startRatio) * easedProgress;
        renderPreview(displayedRatio);
        if (progress < 1) {
            animationId = requestAnimationFrame(animate);
        } else {
            animationId = null;
            displayedRatio = targetRatio;
            renderPreview(displayedRatio);
        }
    }
    animationId = requestAnimationFrame(animate);
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            offsetX = 0;
            offsetY = 0;
            updateResetButtonVisibility();
            displayedRatio = parseRatio(currentRatio);
            targetRatio = displayedRatio;
            showControls();
            renderPreview(displayedRatio);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function showControls() {
    uploadArea.classList.add('hidden');
    controls.classList.add('visible');
}

function resetApp() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    currentImage = null;
    offsetX = 0;
    offsetY = 0;
    currentMode = 'single';
    collageImages = [];
    collageOffsets = [];
    collageSizes = [];
    currentLayout = '2h';
    fileInput.value = '';
    uploadArea.classList.remove('hidden');
    controls.classList.remove('visible');

    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === 'single');
    });
    document.querySelectorAll('.layout-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === '2h');
    });
    const collageControls = document.getElementById('collageControls');
    if (collageControls) collageControls.classList.remove('visible');

    currentRatio = '9:16';
    currentSize = 95;
    displayedRatio = 9/16;
    targetRatio = 9/16;
    sizeSlider.value = 95;
    sizeValue.textContent = '95';
    ratioButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === '9:16');
    });

    const sizeLabel = sizeSlider.closest('.control-group').querySelector('label');
    sizeLabel.innerHTML = 'Image size: <span id="sizeValue">95</span>%';
    sizeValue = document.getElementById('sizeValue');

    updateResetButtonVisibility();
}

// Render the preview
function renderPreview(ratio) {
    if (currentMode === 'collage') {
        renderCollage(ratio);
        return;
    }
    if (!currentImage) return;

    const ctx = previewCanvas.getContext('2d');
    const imgWidth = currentImage.width;
    const imgHeight = currentImage.height;
    const maxDimension = Math.max(imgWidth, imgHeight);

    let frameWidth, frameHeight;
    if (ratio >= 1) {
        frameWidth = maxDimension;
        frameHeight = maxDimension / ratio;
    } else {
        frameHeight = maxDimension;
        frameWidth = maxDimension * ratio;
    }

    previewCanvas.width = frameWidth;
    previewCanvas.height = frameHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    const scale = currentSize / 100;
    const availableWidth = frameWidth * scale;
    const availableHeight = frameHeight * scale;

    const imgRatio = imgWidth / imgHeight;
    let drawWidth, drawHeight;

    if (imgRatio > availableWidth / availableHeight) {
        drawWidth = availableWidth;
        drawHeight = availableWidth / imgRatio;
    } else {
        drawHeight = availableHeight;
        drawWidth = availableHeight * imgRatio;
    }

    const maxOffsetX = (frameWidth - drawWidth) / 2;
    const maxOffsetY = (frameHeight - drawHeight) / 2;
    const x = (frameWidth - drawWidth) / 2 + offsetX * maxOffsetX;
    const y = (frameHeight - drawHeight) / 2 + offsetY * maxOffsetY;

    ctx.drawImage(currentImage, x, y, drawWidth, drawHeight);
}

// Mode switching
function setMode(mode) {
    currentMode = mode;
    const collageControls = document.getElementById('collageControls');
    const sizeLabel = sizeSlider.closest('.control-group').querySelector('label');

    if (mode === 'collage') {
        collageControls.classList.add('visible');
        sizeLabel.innerHTML = 'Border size: <span id="sizeValue">' + currentSize + '</span>%';
        if (currentImage && collageImages.length === 0) {
            collageImages[0] = currentImage;
        }
        renderCollageSlots();
    } else {
        collageControls.classList.remove('visible');
        sizeLabel.innerHTML = 'Image size: <span id="sizeValue">' + currentSize + '</span>%';
    }
    sizeValue = document.getElementById('sizeValue');
    updateResetButtonVisibility();
    renderPreview(displayedRatio);
}

// Collage slot rendering
function renderCollageSlots() {
    const slotsContainer = document.getElementById('collageSlots');
    const cells = LAYOUTS[currentLayout];
    slotsContainer.innerHTML = '';

    cells.forEach((cell, i) => {
        const slotWrapper = document.createElement('div');
        slotWrapper.className = 'collage-slot-wrapper';

        const slot = document.createElement('button');
        slot.className = 'collage-slot' + (collageImages[i] ? ' filled' : '');
        if (collageImages[i]) {
            const thumb = document.createElement('img');
            thumb.src = collageImages[i].src;
            slot.appendChild(thumb);
        } else {
            slot.textContent = '+';
        }
        slot.addEventListener('click', () => pickCollageImage(i));
        slotWrapper.appendChild(slot);

        // Per-image size slider
        if (collageImages[i]) {
            const sizeControl = document.createElement('div');
            sizeControl.className = 'collage-slot-size';
            const sliderLabel = document.createElement('span');
            sliderLabel.textContent = (collageSizes[i] || 100) + '%';
            sliderLabel.className = 'collage-size-label';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '25';
            slider.max = '100';
            slider.value = collageSizes[i] || 100;
            slider.className = 'collage-size-slider';
            slider.addEventListener('input', (e) => {
                collageSizes[i] = parseInt(e.target.value);
                sliderLabel.textContent = collageSizes[i] + '%';
                renderPreview(displayedRatio);
            });
            sizeControl.appendChild(slider);
            sizeControl.appendChild(sliderLabel);
            slotWrapper.appendChild(sizeControl);
        }

        slotsContainer.appendChild(slotWrapper);
    });
}

function pickCollageImage(slotIndex) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                collageImages[slotIndex] = img;
                collageOffsets[slotIndex] = { x: 0, y: 0 };
                if (!collageSizes[slotIndex]) collageSizes[slotIndex] = 100;
                renderCollageSlots();
                renderPreview(displayedRatio);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
    input.click();
}

// Collage rendering
function renderCollage(ratio) {
    const ctx = previewCanvas.getContext('2d');
    const cells = LAYOUTS[currentLayout];

    const refImage = collageImages.find(img => img) || currentImage;
    const baseDim = refImage ? Math.max(refImage.width, refImage.height) : 2000;

    let frameWidth, frameHeight;
    if (ratio >= 1) {
        frameWidth = baseDim;
        frameHeight = baseDim / ratio;
    } else {
        frameHeight = baseDim;
        frameWidth = baseDim * ratio;
    }

    previewCanvas.width = frameWidth;
    previewCanvas.height = frameHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    const gap = Math.min(frameWidth, frameHeight) * (100 - currentSize) / 100 * 0.5;

    // Store cell rects for hit testing
    lastCellRects = [];

    cells.forEach((cell, i) => {
        const img = collageImages[i];

        const isLeft = cell.x === 0;
        const isTop = cell.y === 0;
        const isRight = cell.x + cell.w >= 0.99;
        const isBottom = cell.y + cell.h >= 0.99;

        const px = cell.x * frameWidth + (isLeft ? gap : gap / 2);
        const py = cell.y * frameHeight + (isTop ? gap : gap / 2);
        const pw = cell.w * frameWidth - (isLeft ? gap : gap / 2) - (isRight ? gap : gap / 2);
        const ph = cell.h * frameHeight - (isTop ? gap : gap / 2) - (isBottom ? gap : gap / 2);

        lastCellRects[i] = { px, py, pw, ph };

        if (!img) {
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(px, py, pw, ph);
            return;
        }

        // Per-image size: scale the image within the cell
        const imgSize = (collageSizes[i] || 100) / 100;

        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();

        const imgRatio = img.width / img.height;
        const cellRatio = pw / ph;
        let drawW, drawH, drawX, drawY;

        if (imgRatio > cellRatio) {
            drawH = ph / imgSize;
            drawW = drawH * imgRatio;
        } else {
            drawW = pw / imgSize;
            drawH = drawW / imgRatio;
        }

        // Centre then apply per-image offset
        const off = collageOffsets[i] || { x: 0, y: 0 };
        const maxPanX = (drawW - pw) / 2;
        const maxPanY = (drawH - ph) / 2;
        drawX = px + (pw - drawW) / 2 + off.x * maxPanX;
        drawY = py + (ph - drawH) / 2 + off.y * maxPanY;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
    });
}

// Download the image
function downloadImage() {
    if (!currentImage && currentMode !== 'collage') return;
    renderPreview(targetRatio);
    const link = document.createElement('a');
    link.download = `borda-${currentRatio.replace(':', 'x')}-${Date.now()}.png`;
    link.href = previewCanvas.toDataURL('image/png');
    link.click();
}

// Share the image
async function shareImage() {
    if (!currentImage && currentMode !== 'collage') return;
    renderPreview(targetRatio);

    if (navigator.share && navigator.canShare) {
        try {
            const blob = await new Promise(resolve => {
                previewCanvas.toBlob(resolve, 'image/png');
            });
            const file = new File([blob], `borda-${currentRatio.replace(':', 'x')}.png`, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Borda', text: 'Created with Borda' });
                return;
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    alert('To share to Instagram:\n1. Save the image\n2. Open Instagram\n3. Create a new Story and select the saved image');
    downloadImage();
}

init();
