// ocr_scanner.js - ShowAnswer OCR Sheet Scanner

let videoStream = null;
const videoEl = document.getElementById('camera-video');
const cameraSelect = document.getElementById('camera-select');
const captureBtn = document.getElementById('btn-capture-scan');
const backBtn = document.getElementById('btn-back');
const statsBtn = document.getElementById('btn-tally-results');
const spinnerOverlay = document.getElementById('spinner-overlay');
const spinnerStatus = document.getElementById('spinner-status');
const resultModal = document.getElementById('result-modal');
const modalCloseBtn = document.getElementById('btn-modal-close');

// Server configuration state
let serverIp = localStorage.getItem("ocr_server_ip") || "";
const ipInput = document.getElementById('server-ip-input');
const connectionIndicator = document.getElementById('connection-indicator');

// Populate IP input from localStorage or window hostname
if (ipInput) {
  if (!serverIp && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    serverIp = window.location.hostname;
  }
  // In QuestionScannerProject, if running directly on the laptop, serverIp defaults to localhost
  if (!serverIp) {
    serverIp = window.location.hostname || "localhost";
  }
  ipInput.value = serverIp;
}

// Check connection to server
async function testServerConnection() {
  const ip = ipInput ? ipInput.value.trim() : "";
  if (!ip) {
    if (connectionIndicator) {
      connectionIndicator.style.backgroundColor = "#ef4444";
      connectionIndicator.title = "Offline - Enter Server IP";
    }
    return false;
  }
  
  const port = window.location.port || '8000';
  const serverUrl = `http://${ip}:${port}/api/class`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const res = await fetch(serverUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      if (connectionIndicator) {
        connectionIndicator.style.backgroundColor = "#10b981"; // Connected green
        connectionIndicator.title = "Connected to Python Server";
      }
      localStorage.setItem("ocr_server_ip", ip);
      return true;
    }
  } catch (err) {
    // Fail silently or log
  }
  
  if (connectionIndicator) {
    connectionIndicator.style.backgroundColor = "#ef4444"; // Offline red
    connectionIndicator.title = "Offline - Python Server Unreachable";
  }
  return false;
}

// Watch server connection
if (ipInput) {
  ipInput.addEventListener('input', () => {
    testServerConnection();
  });
  // Initial check
  testServerConnection();
  setInterval(testServerConnection, 5000);
}

// Initialize Camera
async function initCamera() {
  try {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    cameraSelect.innerHTML = '';
    
    let backCameraId = null;
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      
      // Auto detect back camera
      const labelLower = option.text.toLowerCase();
      if (labelLower.includes('back') || labelLower.includes('environment') || labelLower.includes('rear') || labelLower.includes('camera 0')) {
        backCameraId = device.deviceId;
      }
      cameraSelect.appendChild(option);
    });

    if (backCameraId) {
      cameraSelect.value = backCameraId;
    } else if (videoDevices.length > 0) {
      cameraSelect.value = videoDevices[videoDevices.length - 1].deviceId;
    }

    await startStream();
  } catch (err) {
    alert("Camera permission denied or camera not found: " + err.message);
  }
}

async function startStream() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }

  const deviceId = cameraSelect.value;
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: deviceId ? undefined : { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = videoStream;
  } catch (err) {
    // Fallback constraints
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = videoStream;
    } catch (err2) {
      alert("Failed to start camera: " + err2.message);
    }
  }
}

cameraSelect.addEventListener('change', startStream);

// Capture Canvas snapshot and scan
captureBtn.addEventListener('click', async () => {
  if (!videoStream) {
    alert("Camera stream is not active.");
    return;
  }

  const ip = ipInput ? ipInput.value.trim() : "";
  if (!ip) {
    alert("Please enter the Python OCR Server IP address first.");
    return;
  }

  // Set processing UI
  spinnerStatus.textContent = "Capturing high-res frame...";
  spinnerOverlay.classList.add('active');

  try {
    // Create offscreen canvas for snapshot
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    // Extract base64 JPEG
    const base64Img = canvas.toDataURL('image/jpeg', 0.9);
    
    spinnerStatus.textContent = "Extracting handwriting (EasyOCR)...";
    
    // Send request to Python server
    const port = window.location.port || '8000';
    const serverUrl = `http://${ip}:${port}/api/ocr/scan`;
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Img })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }
    
    const data = await response.json();
    spinnerOverlay.classList.remove('active');
    
    if (data.status === 'success') {
      showResults(data);
      
      // Save responses locally to Flutter's DB / Server's DB
      await saveResponsesLocally(data.roll_no, data.answers);
    } else {
      alert("Scanning Error:\n" + (data.message || "Failed to parse answer sheet. Make sure all 4 anchors are fully visible."));
    }
  } catch (err) {
    spinnerOverlay.classList.remove('active');
    alert("Failed to perform OCR scan:\n" + err.message + "\n\nVerify that the Python OCR Server is running on port " + (window.location.port || '8000') + " and is reachable from your mobile phone.");
  }
});

// Save answers locally on the device (so grading, tallies, and CSV export syncs in real-time)
async function saveResponsesLocally(rollNo, answers) {
  try {
    for (let i = 0; i < answers.length; i++) {
      const answerVal = answers[i];
      if (answerVal && answerVal !== '?') {
        const payload = {
          q_index: i,
          responses: {
            [rollNo]: answerVal
          }
        };
        await fetch('/api/quiz/response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    }
    console.log(`[Local Sync] Saved answers for roll no ${rollNo} into mobile local DB.`);
  } catch (err) {
    console.error("Local sync error: ", err);
  }
}

// Display results in the slide-up modal
async function showResults(data) {
  document.getElementById('res-student-name').textContent = data.name || "Unknown Student";
  document.getElementById('res-student-id').textContent = data.roll_no;
  document.getElementById('res-class').textContent = data.class;
  document.getElementById('res-section').textContent = data.section;
  
  const scoreBadge = document.getElementById('res-score-badge');
  scoreBadge.textContent = `${data.score} / ${data.total}`;
  
  // Color the score badge based on passing (say 50%)
  const percentage = data.total > 0 ? (data.score / data.total) : 0;
  if (percentage >= 0.5) {
    scoreBadge.className = "score-badge";
  } else {
    scoreBadge.className = "score-badge fail";
  }

  // Fetch active quiz to display correct answers comparison
  let correctAnswers = {};
  try {
    const quizRes = await fetch('/api/quiz/active');
    if (quizRes.ok) {
      const quizQuestions = await quizRes.json();
      quizQuestions.forEach(q => {
        correctAnswers[q.q_index] = q.correctAnswer;
      });
    }
  } catch (e) {
    // Fail silently
  }

  // Populate answers list rows dynamically
  const listEl = document.getElementById('res-answers-list');
  listEl.innerHTML = '';
  
  const numQuestions = data.answers ? data.answers.length : 5;
  for (let i = 0; i < numQuestions; i++) {
    const studentAns = data.answers[i] || '?';
    const correctAns = correctAnswers[i] || '';
    
    const row = document.createElement('div');
    row.className = 'answer-row';
    
    const leftSpan = document.createElement('div');
    leftSpan.className = 'answer-left';
    leftSpan.innerHTML = `<span>Q${i + 1}:</span>`;
    
    const rightSpan = document.createElement('div');
    rightSpan.className = 'answer-right';
    
    const studentAnsBox = document.createElement('div');
    studentAnsBox.className = 'answer-box';
    studentAnsBox.textContent = studentAns;
    
    if (correctAns) {
      if (studentAns === correctAns) {
        studentAnsBox.classList.add('correct');
        rightSpan.innerHTML += `<span style="color: var(--success); font-size: 0.8rem; font-weight:600;">✓ Correct</span>`;
      } else {
        studentAnsBox.classList.add('incorrect');
        rightSpan.innerHTML += `<span style="color: var(--text-muted); font-size: 0.8rem;">Correct: <strong>${correctAns}</strong></span>`;
      }
    }
    
    rightSpan.appendChild(studentAnsBox);
    row.appendChild(leftSpan);
    row.appendChild(rightSpan);
    listEl.appendChild(row);
  }

  resultModal.classList.add('active');
}

// Close modal and resume scanning
modalCloseBtn.addEventListener('click', () => {
  resultModal.classList.remove('active');
});

// Stats page link
statsBtn.addEventListener('click', () => {
  window.location.href = 'report.html';
});

// Close button redirects back to root /
if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = '/';
  });
}

// Run
initCamera();
