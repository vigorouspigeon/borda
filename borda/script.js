// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const previewCanvas = document.getElementById('previewCanvas');
const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const newPhotoBtn = document.getElementById('newPhotoBtn');
const ratioButtons = document.querySelectorAll('.ratio-btn');

// State
let currentImage = null;
let currentRatio = '9:16';
let currentSize = 95;

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

    // Download button
    downloadBtn.addEventListener('click', downloadImage);

    // Share button
    shareBtn.addEventListener('click', shareImage);

    // New photo button
    newPhotoBtn.addEventListener('click', resetApp);
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
    fileInput.value = '';
    uploadArea.classList.remove('hidden');
    controls.classList.remove('visible');

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
}

// Render the preview
function renderPreview(ratio) {
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

    // Center the image
    const x = (frameWidth - drawWidth) / 2;
    const y = (frameHeight - drawHeight) / 2;

    // Draw the image
    ctx.drawImage(currentImage, x, y, drawWidth, drawHeight);
}

// Download the image
function downloadImage() {
    if (!currentImage) return;

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
    if (!currentImage) return;

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
