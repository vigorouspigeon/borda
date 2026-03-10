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

// Animation state
let displayedRatio = 9/16; // The ratio currently shown (as decimal)
let targetRatio = 9/16;    // The ratio we're animating towards
let animationId = null;
let animationStart = null;
const ANIMATION_DURATION = 450; // milliseconds

// Parse ratio string to decimal
function parseRatio(ratioStr) {
    const [width, height] = ratioStr.split(':').map(Number);
    return width / height;
}

// Easing function (ease-out cubic)
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Initialize
function init() {
    // Upload area click
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Ratio buttons
    ratioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRatio = btn.dataset.ratio;
            animateToRatio(parseRatio(currentRatio));
        });
    });

    // Size slider
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

    // Download button
    downloadBtn.addEventListener('click', downloadImage);

    // Share button
    shareBtn.addEventListener('click', shareImage);

    // New photo button
    newPhotoBtn.addEventListener('click', resetApp);

    // Canvas drag events (mouse)
    previewCanvas.addEventListener('mousedown', dragStart);
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('mouseup', dragEnd);

    // Canvas drag events (touch)
    previewCanvas.addEventListener('touchstart', dragStart, { passive: false });
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('touchend', dragEnd);

    // Double-click/tap to reset position
    previewCanvas.addEventListener('dblclick', resetPosition);
}

function getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function dragStart(e) {
    if (!currentImage || currentMode === 'collage') return;
    e.preventDefault();
    isDragging = true;
    const pos = getPointerPos(e);
    dragStartX = pos.x;
    dragStartY = pos.y;
    dragStartOffsetX = offsetX;
    dragStartOffsetY = offsetY;
    previewCanvas.classList.add('dragging');
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const rect = previewCanvas.getBoundingClientRect();

    // Convert pixel delta to offset delta (normalized to canvas display size)
    const deltaX = (pos.x - dragStartX) / rect.width * 2;
    const deltaY = (pos.y - dragStartY) / rect.height * 2;

    offsetX = Math.max(-1, Math.min(1, dragStartOffsetX + deltaX));
    offsetY = Math.max(-1, Math.min(1, dragStartOffsetY + deltaY));

    renderPreview(displayedRatio);
}

function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    previewCanvas.classList.remove('dragging');
}

function resetPosition() {
    if (currentMode === 'collage') return;
    offsetX = 0;
    offsetY = 0;
    renderPreview(displayedRatio);
}

// Animate to a new ratio
function animateToRatio(newTargetRatio) {
    // Cancel any ongoing animation
    if (animationId) {
        cancelAnimationFrame(animationId);
    }

    targetRatio = newTargetRatio;
    animationStart = performance.now();
    const startRatio = displayedRatio;

    function animate(currentTime) {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutCubic(progress);

        // Interpolate between start and target ratio
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

    // Validate it's an image
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
            displayedRatio = parseRatio(currentRatio);
            targetRatio = displayedRatio;
            showControls();
            renderPreview(displayedRatio);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Show controls, hide upload area
function showControls() {
    uploadArea.classList.add('hidden');
    controls.classList.add('visible');
}

// Reset app to initial state
function resetApp() {
    // Cancel any ongoing animation
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    currentImage = null;
    offsetX = 0;
    offsetY = 0;
    currentMode = 'single';
    collageImages = [];
    currentLayout = '2h';
    fileInput.value = '';
    uploadArea.classList.remove('hidden');
    controls.classList.remove('visible');

    // Reset mode toggle
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === 'single');
    });
    document.querySelectorAll('.layout-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === '2h');
    });
    const collageControls = document.getElementById('collageControls');
    if (collageControls) collageControls.classList.remove('visible');

    // Reset to defaults
    currentRatio = '9:16';
    currentSize = 95;
    displayedRatio = 9/16;
    targetRatio = 9/16;
    sizeSlider.value = 95;
    sizeValue.textContent = '95';
    ratioButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === '9:16');
    });

    // Reset size label
    const sizeLabel = sizeSlider.closest('.control-group').querySelector('label');
    sizeLabel.innerHTML = 'Image size: <span id="sizeValue">95</span>%';
    sizeValue = document.getElementById('sizeValue');
}

// Render the preview
function renderPreview(ratio) {
    if (currentMode === 'collage') {
        renderCollage(ratio);
        return;
    }
    if (!currentImage) return;

    const ctx = previewCanvas.getContext('2d');

    // Determine output dimensions based on the longer side of the original image
    // We'll use the original image resolution to maintain quality
    const imgWidth = currentImage.width;
    const imgHeight = currentImage.height;
    const maxDimension = Math.max(imgWidth, imgHeight);

    // Calculate frame dimensions based on aspect ratio
    let frameWidth, frameHeight;
    if (ratio >= 1) {
        // Wider than tall (or square)
        frameWidth = maxDimension;
        frameHeight = maxDimension / ratio;
    } else {
        // Taller than wide
        frameHeight = maxDimension;
        frameWidth = maxDimension * ratio;
    }

    // Set canvas size
    previewCanvas.width = frameWidth;
    previewCanvas.height = frameHeight;

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    // Calculate the size the image should be drawn at
    // The percentage represents how much of the frame the image fills
    const scale = currentSize / 100;
    const availableWidth = frameWidth * scale;
    const availableHeight = frameHeight * scale;

    // Scale image to fit within available space while maintaining aspect ratio
    const imgRatio = imgWidth / imgHeight;
    let drawWidth, drawHeight;

    if (imgRatio > availableWidth / availableHeight) {
        // Image is wider relative to available space
        drawWidth = availableWidth;
        drawHeight = availableWidth / imgRatio;
    } else {
        // Image is taller relative to available space
        drawHeight = availableHeight;
        drawWidth = availableHeight * imgRatio;
    }

    // Center the image, then apply offset
    const maxOffsetX = (frameWidth - drawWidth) / 2;
    const maxOffsetY = (frameHeight - drawHeight) / 2;
    const x = (frameWidth - drawWidth) / 2 + offsetX * maxOffsetX;
    const y = (frameHeight - drawHeight) / 2 + offsetY * maxOffsetY;

    // Draw the image
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
        // Initialize collage with current image if available
        if (currentImage && collageImages.length === 0) {
            collageImages[0] = currentImage;
        }
        renderCollageSlots();
    } else {
        collageControls.classList.remove('visible');
        sizeLabel.innerHTML = 'Image size: <span id="sizeValue">' + currentSize + '</span>%';
    }
    // Rebind sizeValue reference
    sizeValue = document.getElementById('sizeValue');
    renderPreview(displayedRatio);
}

// Collage slot rendering
function renderCollageSlots() {
    const slotsContainer = document.getElementById('collageSlots');
    const cells = LAYOUTS[currentLayout];
    slotsContainer.innerHTML = '';

    cells.forEach((cell, i) => {
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
        slotsContainer.appendChild(slot);
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

    // Use the first available image to determine base resolution, or default
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

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    // Gap is proportional to (100 - currentSize)
    const gap = Math.min(frameWidth, frameHeight) * (100 - currentSize) / 100 * 0.5;

    cells.forEach((cell, i) => {
        const img = collageImages[i];

        // Adjust: outer gap for edges, half gap for internal divisions
        const isLeft = cell.x === 0;
        const isTop = cell.y === 0;
        const isRight = cell.x + cell.w >= 0.99;
        const isBottom = cell.y + cell.h >= 0.99;

        const px = cell.x * frameWidth + (isLeft ? gap : gap / 2);
        const py = cell.y * frameHeight + (isTop ? gap : gap / 2);
        const pw = cell.w * frameWidth - (isLeft ? gap : gap / 2) - (isRight ? gap : gap / 2);
        const ph = cell.h * frameHeight - (isTop ? gap : gap / 2) - (isBottom ? gap : gap / 2);

        if (!img) {
            // Draw empty slot placeholder
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(px, py, pw, ph);
            return;
        }

        // Draw image cropped to fill cell
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();

        const imgRatio = img.width / img.height;
        const cellRatio = pw / ph;
        let drawW, drawH, drawX, drawY;

        if (imgRatio > cellRatio) {
            // Image wider than cell — crop sides
            drawH = ph;
            drawW = ph * imgRatio;
            drawX = px + (pw - drawW) / 2;
            drawY = py;
        } else {
            // Image taller than cell — crop top/bottom
            drawW = pw;
            drawH = pw / imgRatio;
            drawX = px;
            drawY = py + (ph - drawH) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
    });
}

// Download the image
function downloadImage() {
    if (!currentImage && currentMode !== 'collage') return;

    // Render at the exact target ratio before downloading
    renderPreview(targetRatio);

    // Create a link and trigger download
    const link = document.createElement('a');
    link.download = `borda-${currentRatio.replace(':', 'x')}-${Date.now()}.png`;
    link.href = previewCanvas.toDataURL('image/png');
    link.click();
}

// Share the image (for Instagram Stories)
async function shareImage() {
    if (!currentImage && currentMode !== 'collage') return;

    // Render at the exact target ratio before sharing
    renderPreview(targetRatio);

    // Check if Web Share API is supported with files
    if (navigator.share && navigator.canShare) {
        try {
            // Convert canvas to blob
            const blob = await new Promise(resolve => {
                previewCanvas.toBlob(resolve, 'image/png');
            });

            const file = new File([blob], `borda-${currentRatio.replace(':', 'x')}.png`, {
                type: 'image/png'
            });

            // Check if we can share this file
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Borda',
                    text: 'Created with Borda'
                });
                return;
            }
        } catch (err) {
            // User cancelled or share failed - fall through to download
            if (err.name === 'AbortError') return;
        }
    }

    // Fallback: download the image with a helpful message
    alert('To share to Instagram:\n1. Save the image\n2. Open Instagram\n3. Create a new Story and select the saved image');
    downloadImage();
}

// Start the app
init();
