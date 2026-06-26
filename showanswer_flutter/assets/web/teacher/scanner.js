/* ==========================================================================
   ShowAnswer — Live Scanner Logic (Port 8002)
   ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
//  STABILITY TRACKING CLASS
// ─────────────────────────────────────────────────────────────────────────────
class StabilityBuffer {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this.history = {}; // { markerId: [answers] }
  }

  update(markerId, answer) {
    if (!this.history[markerId]) {
      this.history[markerId] = [];
    }
    this.history[markerId].push(answer);

    if (this.history[markerId].length > this.windowSize) {
      this.history[markerId].shift();
    }

    const buf = this.history[markerId];
    if (buf.length < this.windowSize) {
      return null;
    }

    const first = buf[0];
    const allIdentical = buf.every(val => val === first);

    return allIdentical ? first : null;
  }

  clearAbsent(visibleSet) {
    for (const markerId in this.history) {
      if (!visibleSet.has(parseInt(markerId))) {
        this.history[markerId] = [];
      }
    }
  }

  reset() {
    this.history = {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let roster = [];
let responses = {}; // { student_id: answer }
let stability = new StabilityBuffer(5);
let activeQuestionData = null;
let quizQuestions = [];
let currentQuestionIndex = 0;

// Webcam/IP stream variables
let stream = null;
let detector = null;
let animationFrameId = null;
let lastFpsUpdate = 0;
let frameCount = 0;
let detFrameCount = 0;
let displayFps = 0;
let detectionFps = 0;
let canvasTainted = false;

// Active source type: 'webcam' or 'ipcamera'
let cameraSourceType = 'webcam';

// Answer colors matching CSS HSL
const ANSWER_COLORS = {
  "A": "#10b981", // Green
  "B": "#3b82f6", // Blue
  "C": "#ef4444", // Red
  "D": "#8b5cf6"  // Purple
};

// ─────────────────────────────────────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  detector = new AR.Detector({ dictionaryName: 'DICT_4X4_1000' });
  initScannerControls();
  establishHandshake();
  fetchActiveQuiz();
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECTION HANDSHAKE
// ─────────────────────────────────────────────────────────────────────────────
function establishHandshake() {
  // 1. Fetch class list from the network API on startup
  fetchClass();

  // 2. Start periodic sync timers
  setInterval(fetchClass, 5000);
  setInterval(fetchResponses, 1500);
}

function fetchActiveQuiz() {
  fetch('/api/quiz/active')
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        quizQuestions = data;
        currentQuestionIndex = 0;
        
        // Show navigation bar
        const nav = document.getElementById('quiz-navigation');
        if (nav) nav.classList.remove('hidden');
        
        updateActiveQuestionDisplay();
      } else {
        quizQuestions = [];
        const card = document.getElementById('active-question-card');
        if (card) card.classList.add('hidden');
        const nav = document.getElementById('quiz-navigation');
        if (nav) nav.classList.add('hidden');
      }
    })
    .catch(err => console.warn("Failed to fetch active quiz:", err));
}

function updateActiveQuestionDisplay() {
  if (quizQuestions.length === 0) return;
  activeQuestionData = quizQuestions[currentQuestionIndex];
  
  // Reset local scanned responses on UI updates
  responses = {};
  stability.reset();
  
  // Update index progress label
  const idxEl = document.getElementById('active-question-index');
  if (idxEl) idxEl.textContent = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
  
  // Show active question text and choices
  const card = document.getElementById('active-question-card');
  if (card) card.classList.remove('hidden');
  
  const textEl = document.getElementById('active-question-text');
  const optA = document.getElementById('active-opt-a');
  const optB = document.getElementById('active-opt-b');
  const optC = document.getElementById('active-opt-c');
  const optD = document.getElementById('active-opt-d');
  
  if (textEl) textEl.textContent = activeQuestionData.question;
  if (optA) optA.textContent = activeQuestionData.optionA;
  if (optB) optB.textContent = activeQuestionData.optionB;
  if (optC) optC.textContent = activeQuestionData.optionC;
  if (optD) optD.textContent = activeQuestionData.optionD;

  // Update button text and style on the last question
  const btnNext = document.getElementById('btn-next-question');
  if (btnNext) {
    if (currentQuestionIndex === quizQuestions.length - 1) {
      btnNext.textContent = 'Finish Quiz & View Report 📊';
      btnNext.className = 'btn btn-success';
    } else {
      btnNext.textContent = 'Next Question ➡';
      btnNext.className = 'btn btn-primary';
    }
  }
}

function handleNextQuestionClick() {
  if (quizQuestions.length === 0) return;
  
  const payload = {
    q_index: currentQuestionIndex,
    responses: responses
  };
  
  // POST answers for current question to database
  fetch('/api/quiz/response', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(result => {
    if (result.status === 'success') {
      if (currentQuestionIndex === quizQuestions.length - 1) {
        // Redirect to report.html
        window.location.href = 'report.html';
      } else {
        // Clear scanner overlay and responses on screen
        const overlay = document.getElementById('overlay-canvas');
        if (overlay) {
          const ctx = overlay.getContext('2d');
          ctx.clearRect(0, 0, overlay.width, overlay.height);
        }
        
        // Go to next question
        currentQuestionIndex++;
        
        // Clear active scanner responses on the server
        fetch('/api/reset_responses', { method: 'POST' })
          .then(() => {
            updateActiveQuestionDisplay();
            updateAnalyticsUI(new Set());
          });
      }
    } else {
      alert("Failed to save responses for this question.");
    }
  })
  .catch(err => {
    console.error("Error saving responses:", err);
    alert("Error contacting the server. Could not save responses.");
  });
}

function fetchClass() {
  fetch('/api/class')
    .then(res => res.json())
    .then(serverClass => {
      if (serverClass && JSON.stringify(serverClass) !== JSON.stringify(roster)) {
        roster = serverClass;
        onClassUpdated();
      }
    })
    .catch(err => {
      console.warn("Could not retrieve class list from network API:", err);
      // If we don't have an opener, let the user know we are standalone/offline
      if (!window.opener && roster.length === 0) {
        const syncStatus = document.getElementById('sync-status');
        syncStatus.textContent = '⚠️ Standalone Mode (API Offline)';
        syncStatus.className = 'sync-indicator unsynced';
      }
    });
}

function fetchResponses() {
  fetch('/api/responses')
    .then(res => res.json())
    .then(serverResponses => {
      if (serverResponses) {
        const changed = JSON.stringify(responses) !== JSON.stringify(serverResponses);
        if (changed) {
          responses = serverResponses;
          updateAnalyticsUI(new Set());
        }
      }
    })
    .catch(err => console.warn("Failed to poll responses from API:", err));
}

function onClassUpdated() {
  const syncStatus = document.getElementById('sync-status');
  if (roster.length === 0) {
    syncStatus.textContent = '⚠️ Empty Class List';
    syncStatus.className = 'sync-indicator unsynced';
  } else {
    syncStatus.textContent = '🟢 Class Synced';
    syncStatus.className = 'sync-indicator synced';
  }
  updateAnalyticsUI(new Set());
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCANNER CONTROLS & CAMERA INTERACTION
// ─────────────────────────────────────────────────────────────────────────────
function initScannerControls() {

  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  const resetBtn = document.getElementById('reset-tally-btn');
  const showAnalyticsBtn = document.getElementById('show-analytics-btn');
  startBtn.addEventListener('click', startScan);
  stopBtn.addEventListener('click', stopScan);
  resetBtn.addEventListener('click', resetTally);
  showAnalyticsBtn.addEventListener('click', openAnalyticsModal);

  const btnNext = document.getElementById('btn-next-question');
  if (btnNext) {
    btnNext.addEventListener('click', handleNextQuestionClick);
  }

  // Modal buttons
  document.getElementById('close-modal-btn').addEventListener('click', closeAnalyticsModal);
  document.getElementById('close-modal-header-btn').addEventListener('click', closeAnalyticsModal);
  document.getElementById('export-csv-modal-btn').addEventListener('click', exportCSVResults);

  // Camera source radio button toggles
  document.querySelectorAll('input[name="camera-source-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      cameraSourceType = e.target.value;
      if (cameraSourceType === 'webcam') {
        document.getElementById('webcam-controls').classList.remove('hidden');
        document.getElementById('ipcamera-controls').classList.add('hidden');
      } else {
        document.getElementById('webcam-controls').classList.add('hidden');
        document.getElementById('ipcamera-controls').classList.remove('hidden');
      }
      stopScan();
    });
  });

  // Load cameras list for local webcam
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const select = document.getElementById('camera-select');
      select.innerHTML = '<option value="">Default (Back Camera)</option>';
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (videoDevices.length === 0) {
        select.innerHTML = '<option value="">No cameras detected</option>';
        return;
      }

      videoDevices.forEach((device, index) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        const label = device.label || `Camera ${index + 1}`;
        opt.textContent = label;

        // Auto-select if the label explicitly hints it's a back/rear camera
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('back') || lowerLabel.includes('rear') ||
          lowerLabel.includes('environment')) {
          opt.selected = true;
        }

        select.appendChild(opt);
      });
    })
    .catch(err => {
      console.error("Error listing cameras:", err);
    });
}

function startScan() {
  if (roster.length === 0) {
    alert("Class list is empty! Please load or sync a class list from the Classroom Hub.");
    return;
  }

  canvasTainted = false;

  if (cameraSourceType === 'webcam') {
    startWebcam();
  } else {
    startIpCamera();
  }
}

function startWebcam() {
  const cameraId = document.getElementById('camera-select').value;
  const res = document.getElementById('res-select').value;

  let widthConstraint = 1280;
  let heightConstraint = 720;
  if (res === '1080p') {
    widthConstraint = 1920;
    heightConstraint = 1080;
  } else if (res === '480p') {
    widthConstraint = 640;
    heightConstraint = 480;
  }

  const constraints = {
    video: {
      deviceId: cameraId ? { exact: cameraId } : undefined,
      facingMode: cameraId ? undefined : { ideal: 'environment' },
      width: { ideal: widthConstraint },
      height: { ideal: heightConstraint }
    },
    audio: false
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(mediaStream => {
      stream = mediaStream;
      const video = document.getElementById('webcam-video');
      video.srcObject = stream;

      // Toggle visibility
      video.classList.remove('hidden');
      document.getElementById('ip-camera-img').classList.add('hidden');
      document.getElementById('scanner-placeholder').classList.add('hidden');
      document.getElementById('start-scan-btn').classList.add('hidden');
      document.getElementById('stop-scan-btn').classList.remove('hidden');

      const indicator = document.getElementById('scanner-status');
      indicator.textContent = 'Scanner Active (Webcam)';
      indicator.className = 'status-indicator online';

      video.onloadedmetadata = () => {
        video.play();
        startProcessingLoop();
      };
    })
    .catch(err => {
      console.error("Camera access failed:", err);
      alert(`Could not access webcam: ${err.message}`);
    });
}

function startIpCamera() {
  let urlInput = document.getElementById('ip-camera-url').value.trim();
  if (!urlInput) {
    alert("Please enter the IP camera address or URL of your phone.");
    return;
  }

  // Auto-expand raw IP configurations
  // Match standard IP address or IP:port (e.g. 192.168.1.50 or 192.168.1.50:8080)
  const rawIpPattern = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;
  const match = urlInput.match(rawIpPattern);
  if (match) {
    const ip = match[1];
    const port = match[2] || ':8080';
    urlInput = `http://${ip}${port}/video`;
    document.getElementById('ip-camera-url').value = urlInput;
  } else if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
    // If no protocol was entered, prepend http://
    urlInput = `http://${urlInput}`;
  }

  const img = document.getElementById('ip-camera-img');

  // Set crossOrigin to anonymous to request CORS headers from the IP camera server
  img.crossOrigin = "anonymous";
  img.src = urlInput;

  // Toggle visibility
  img.classList.remove('hidden');
  document.getElementById('webcam-video').classList.add('hidden');
  document.getElementById('scanner-placeholder').classList.add('hidden');
  document.getElementById('start-scan-btn').classList.add('hidden');
  document.getElementById('stop-scan-btn').classList.remove('hidden');

  const indicator = document.getElementById('scanner-status');
  indicator.textContent = 'Scanner Active (IP Camera)';
  indicator.className = 'status-indicator online';

  // Wait for the stream image metadata load to initialize processing loop
  img.onload = () => {
    // Start processing if not already running
    if (!animationFrameId) {
      startProcessingLoop();
    }
  };

  img.onerror = () => {
    alert("Failed to load IP camera stream. Check that the IP address/URL is correct and your phone is connected to the same network.");
    stopScan();
  };
}

function stopScan() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  const video = document.getElementById('webcam-video');
  video.srcObject = null;
  video.classList.add('hidden');

  const img = document.getElementById('ip-camera-img');
  img.src = '';
  img.classList.add('hidden');

  // Clear canvases
  const overlay = document.getElementById('overlay-canvas');
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Toggle buttons
  document.getElementById('scanner-placeholder').classList.remove('hidden');
  document.getElementById('start-scan-btn').classList.remove('hidden');
  document.getElementById('stop-scan-btn').classList.add('hidden');

  const indicator = document.getElementById('scanner-status');
  indicator.textContent = 'Scanner Offline';
  indicator.className = 'status-indicator offline';

  document.getElementById('fps-display').textContent = 'Display: -- fps | Det: -- fps';
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROCESSING LOOP
// ─────────────────────────────────────────────────────────────────────────────
function startProcessingLoop() {
  const video = document.getElementById('webcam-video');
  const img = document.getElementById('ip-camera-img');
  const overlay = document.getElementById('overlay-canvas');
  const processCanvas = document.getElementById('hidden-process-canvas');

  const oCtx = overlay.getContext('2d');
  const pCtx = processCanvas.getContext('2d');

  const resizeCanvases = () => {
    let targetWidth = 1280;
    let targetHeight = 720;

    if (cameraSourceType === 'webcam') {
      if (video.videoWidth) {
        targetWidth = video.videoWidth;
        targetHeight = video.videoHeight;
      }
    } else {
      if (img.naturalWidth) {
        targetWidth = img.naturalWidth;
        targetHeight = img.naturalHeight;
      }
    }

    if (overlay.width !== targetWidth || overlay.height !== targetHeight) {
      overlay.width = targetWidth;
      overlay.height = targetHeight;
      processCanvas.width = targetWidth;
      processCanvas.height = targetHeight;
      console.log(`Canvas aligned to: ${targetWidth}x${targetHeight}`);
    }
  };

  frameCount = 0;
  detFrameCount = 0;
  lastFpsUpdate = performance.now();

  const loop = () => {
    if (cameraSourceType === 'webcam' && !stream) return;
    if (cameraSourceType === 'ipcamera' && !img.src) return;

    resizeCanvases();

    // 1. Draw frame to hidden processing canvas
    if (cameraSourceType === 'webcam') {
      pCtx.drawImage(video, 0, 0, processCanvas.width, processCanvas.height);
    } else {
      if (img.complete && img.naturalWidth > 0) {
        pCtx.drawImage(img, 0, 0, processCanvas.width, processCanvas.height);
      } else {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }
    }

    // 2. Read raw pixel bytes
    const imgData = pCtx.getImageData(0, 0, processCanvas.width, processCanvas.height);

    // 3. Process ArUco detection (alternating frames to save CPU)
    let markers = [];
    if (frameCount % 2 === 0) {
      markers = detector.detect(imgData);
      detFrameCount++;
      processDetections(markers);
    }

    // 4. Render overlay visual boxes
    drawOverlays(oCtx, markers, overlay.width, overlay.height);

    // 5. Update FPS Counters
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
      displayFps = (frameCount * 1000) / (now - lastFpsUpdate);
      detectionFps = (detFrameCount * 1000) / (now - lastFpsUpdate);

      document.getElementById('fps-display').textContent = `Display: ${displayFps.toFixed(0)}fps | Det: ${detectionFps.toFixed(0)}fps`;

      frameCount = 0;
      detFrameCount = 0;
      lastFpsUpdate = now;
    }

    animationFrameId = requestAnimationFrame(loop);
  };

  animationFrameId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROCESS SCANNER LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function processDetections(markers) {
  const visibleIds = new Set();
  const stabilizingSet = new Set();
  let hasNewLocks = false;

  markers.forEach(marker => {
    const mid = marker.id;
    visibleIds.add(mid);

    const student = roster.find(s => s.marker_id === mid);
    if (!student) return;

    // Calculate angle & decode answer
    const corners = marker.corners;
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

    const dx = corners[0].x - cx;
    const dy = corners[0].y - cy;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    let answer = "A";
    if (angle >= -90 && angle < 0) {
      answer = "D"; // Left edge (D) rotated to top (90° CW rotation)
    } else if (angle >= 0 && angle < 90) {
      answer = "C"; // Bottom edge (C) rotated to top (180° rotation)
    } else if (angle >= 90 && angle < 180) {
      answer = "B"; // Right edge (B) rotated to top (90° CCW rotation)
    } else {
      answer = "A"; // Top edge (A) upright
    }

    const lockedAnswer = stability.update(mid, answer);
    if (lockedAnswer) {
      if (responses[student.student_id] !== lockedAnswer) {
        responses[student.student_id] = lockedAnswer;
        hasNewLocks = true;
      }
    } else {
      stabilizingSet.add(student.name);
    }
  });

  stability.clearAbsent(visibleIds);

  // Sync back if new answers were locked
  if (hasNewLocks) {
    // POST to the network API
    fetch('/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responses)
    }).catch(err => console.error("Error sending responses to API:", err));
  }

  updateAnalyticsUI(stabilizingSet);
}

function drawOverlays(ctx, markers, width, height) {
  ctx.clearRect(0, 0, width, height);

  markers.forEach(marker => {
    const mid = marker.id;
    const student = roster.find(s => s.marker_id === mid);
    if (!student) return;

    const corners = marker.corners;
    const isLocked = !!responses[student.student_id];

    let color = "#f59e0b"; // Stabilizing
    let textSuffix = "...";

    if (isLocked) {
      color = "#10b981"; // Success green for all locked responses
      textSuffix = " → ✓";
    }

    // Quadrilateral boundary lines
    ctx.strokeStyle = color;
    ctx.lineWidth = isLocked ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.stroke();

    // Corners circles
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(corners[i].x, corners[i].y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Render center label
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const label = `${student.name}${textSuffix}`;

    ctx.font = "bold 14px 'Outfit', sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";

    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.fillRect(cx - (textWidth / 2) - 8, cy - 26, textWidth + 16, 20);

    ctx.fillStyle = isLocked ? "#ffffff" : color;
    ctx.fillText(label, cx, cy - 11);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANALYTICS UI
// ─────────────────────────────────────────────────────────────────────────────
function updateAnalyticsUI(stabilizingSet) {
  // Stabilizing sidebar panel
  const stabList = document.getElementById('stabilizing-list');
  if (stabilizingSet.size > 0) {
    stabList.innerHTML = Array.from(stabilizingSet).join(', ');
  } else {
    stabList.textContent = 'No cards stabilizing...';
  }

  // Count tallies
  const tallies = { A: 0, B: 0, C: 0, D: 0 };
  let totalLocked = 0;

  for (const sid in responses) {
    const ans = responses[sid];
    if (tallies[ans] !== undefined) {
      tallies[ans]++;
      totalLocked++;
    }
  }

  document.getElementById('locked-count-badge').textContent = `${totalLocked} Locked`;

  const maxVotes = Math.max(tallies.A, tallies.B, tallies.C, tallies.D, 1);
  const labels = document.querySelectorAll('.bar-label');
  const letters = ["A", "B", "C", "D"];

  letters.forEach((letter, index) => {
    const count = tallies[letter];
    document.getElementById(`count-${letter.toLowerCase()}`).textContent = count;

    const percentage = (count / maxVotes) * 100;
    document.getElementById(`bar-${letter.toLowerCase()}`).style.width = `${percentage}%`;

    if (labels[index]) {
      labels[index].textContent = letter;
    }
  });

  // Rebuild locked list table
  const tbody = document.getElementById('locked-tbody');
  tbody.innerHTML = '';

  const loggedStudentIds = Object.keys(responses);
  if (loggedStudentIds.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-list-row">
        <td colspan="3">No responses locked in yet. Hold up your cards!</td>
      </tr>`;
    return;
  }

  // Sort logged list by student name
  const sortedLogged = loggedStudentIds.map(sid => {
    const student = roster.find(s => s.student_id === sid);
    return {
      name: student ? student.name : "Unknown Student",
      student_id: sid,
      answer: responses[sid]
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  sortedLogged.forEach(res => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${res.name}</td>
      <td>${res.student_id}</td>
      <td>
        <span class="answer-pill green-bg">✓</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function resetTally() {
  if (confirm("Reset all current poll responses?")) {
    responses = {};
    stability.reset();

    // Also reset on the server API
    fetch('/api/reset_responses', {
      method: 'POST'
    }).catch(err => console.error("Error resetting responses on API:", err));

    updateAnalyticsUI(new Set());

    // Clear overlay canvas
    const overlay = document.getElementById('overlay-canvas');
    if (overlay) {
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT RESULTS TO CSV
// ─────────────────────────────────────────────────────────────────────────────
function exportCSVResults() {
  if (roster.length === 0) {
    alert("No class list synced to export!");
    return;
  }

  // Generate standard CSV content
  let csvContent = "Student ID,Student Name,Selected Answer\r\n";
  roster.forEach(student => {
    const ans = responses[student.student_id] || "";
    csvContent += `"${student.student_id}","${student.name}","${ans}"\r\n`;
  });

  const filename = `ShowAnswer_Poll_Results_${new Date().toISOString().slice(0, 10)}.csv`;
  if (window.ExportChannel) {
    window.ExportChannel.postMessage(JSON.stringify({
      filename: filename,
      csv: csvContent
    }));
  } else {
    // Create a Blob and generate a temporary URL for safe download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANALYTICS POPUP MODAL LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function openAnalyticsModal() {
  const modal = document.getElementById('analytics-modal');
  modal.classList.remove('hidden');

  // Calculate statistics
  const total = roster.length;
  const locked = Object.keys(responses).length;

  document.getElementById('modal-stat-total').textContent = total;
  document.getElementById('modal-stat-locked').textContent = locked;

  // Cheat Prevention: Hide correct answers and accuracy from scanner modal
  document.getElementById('stat-card-correct').classList.add('hidden');
  document.getElementById('stat-card-accuracy').classList.add('hidden');

  // Build CSV Visual Lookup table
  const tbody = document.getElementById('modal-lookup-tbody');
  tbody.innerHTML = '';

  if (roster.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; font-style:italic;">No students in class list.</td></tr>`;
    return;
  }

  // Sort by student name
  const sortedRoster = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  sortedRoster.forEach(student => {
    const ans = responses[student.student_id];
    let ansHtml = '';
    if (ans) {
      ansHtml = `<span class="answer-pill ${ans.toLowerCase()}-bg">${ans}</span>`;
    } else {
      ansHtml = `<span class="answer-pill" style="background-color: #e2e8f0; color: #64748b;">-</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${student.name}</strong></td>
      <td>${student.student_id}</td>
      <td>${ansHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function closeAnalyticsModal() {
  const modal = document.getElementById('analytics-modal');
  modal.classList.add('hidden');
}
