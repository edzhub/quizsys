/* ==========================================================================
   ShowAnswer — Classroom Hub Logic (Hub Portal - Port 8000)
   ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let classList = [];
let generatorWindow = null;
let scannerWindow = null;

// No demo defaults — class list must come from CSV upload or server DB

function startHub() {
  try {
    checkPCConnection();
  } catch (e) {
    console.error("Error starting PC connection check:", e);
  }
  try {
    initClassList();
  } catch (e) {
    console.error("Error initializing class list:", e);
  }
  try {
    initCSVUpload();
  } catch (e) {
    console.error("Error initializing CSV upload:", e);
  }
  try {
    initConnectionSync();
  } catch (e) {
    console.error("Error initializing connection sync:", e);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startHub);
} else {
  startHub();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLASS LIST MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function initClassList() {
  // ── STEP 1: Load from localStorage IMMEDIATELY (synchronous, no flicker) ──
  // This guarantees the class list is always visible on page load.
  // It only disappears if the user manually clicks "Clear Class List".
  const saved = localStorage.getItem('showanswer_class_list');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.length > 0) {
        classList = parsed;
        updateClassTable();
      }
    } catch(e) {}
  }

  // ── STEP 2: Fetch from server in background to get the latest data ──
  // If server has data, update the display. If server returns empty,
  // keep showing what localStorage has (do NOT overwrite with empty).
  fetch(`/api/class`, { cache: 'no-store' })
    .then(res => res.json())
    .then(serverClass => {
      if (serverClass && serverClass.length > 0) {
        // Server has data — update display and refresh localStorage cache
        classList = serverClass;
        localStorage.setItem('showanswer_class_list', JSON.stringify(classList));
        updateClassTable();
        broadcastClassList();
      } else if (classList.length > 0) {
        // Server returned empty but we have local data — re-sync it to server
        // This recovers from the case where the POST was lost during navigation
        fetch(`/api/class`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(classList)
        }).catch(err => console.warn('Re-sync to server failed:', err));
      }
      // If both server and localStorage are empty, leave table as-is (empty)
    })
    .catch(err => {
      // Server unreachable — already showing localStorage data from Step 1, nothing to do
      console.warn("Class API unavailable, using cached localStorage data:", err);
    });


  // Add manual student
  document.getElementById('add-student-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('student-name').value.trim();
    const student_id = document.getElementById('student-id').value.trim();

    // Auto-assign next available marker ID (0-999)
    let marker_id = 0;
    while (classList.some(s => s.marker_id === marker_id)) {
      marker_id++;
    }
    if (marker_id > 999) {
      alert("Maximum class size of 1000 reached!");
      return;
    }

    if (classList.some(s => s.student_id === student_id)) {
      alert(`Student ID ${student_id} is already in the class list!`);
      return;
    }

    classList.push({ marker_id, student_id, name });
    saveClassList();
    
    // Reset form fields
    document.getElementById('student-name').value = '';
    document.getElementById('student-id').value = '';
  });

  // Clear class list
  document.getElementById('clear-class-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all students from the class list?')) {
      classList = [];
      saveClassList();
    }
  });
}

function saveClassList() {
  localStorage.setItem('showanswer_class_list', JSON.stringify(classList));
  updateClassTable();
  broadcastClassList();
  
  // POST to the network API
  fetch(`/api/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(classList)
  }).catch(err => console.error("Error uploading class list to database API:", err));
}

function updateClassTable() {
  const tbody = document.getElementById('class-tbody');
  const countSpan = document.getElementById('class-count');
  
  countSpan.textContent = classList.length;
  tbody.innerHTML = '';

  if (classList.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="2">No students loaded. Upload a CSV or add students manually above.</td>
      </tr>`;
    return;
  }

  // Sort class list by marker ID
  const sortedClass = [...classList].sort((a, b) => a.marker_id - b.marker_id);
  
  sortedClass.forEach(student => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${student.student_id}</td>
      <td>${student.name}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────
function initCSVUpload() {
  const dropZone = document.getElementById('csv-drop-zone');
  const fileInput = document.getElementById('csv-file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleCSVFile(file);
    } else {
      alert('Please upload a valid CSV file.');
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleCSVFile(file);
    }
  });
}

function handleCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    parseClassCSV(text);
  };
  reader.readAsText(file);
}

function parseClassCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) {
    alert('CSV is empty or missing headers.');
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const idxMarker = headers.indexOf('marker_id');
  const idxStudent = headers.indexOf('student_id');
  const idxName = headers.indexOf('name');

  if (idxStudent === -1 || idxName === -1) {
    alert('CSV must contain student_id and name headers.');
    return;
  }

  const parsedStudents = [];
  const seenMarkers = new Set();
  const seenStudents = new Set();

  // Find next available marker ID helper inside CSV parser
  let nextAutoId = 0;
  function getNextCsvMarkerId() {
    while (seenMarkers.has(nextAutoId)) {
      nextAutoId++;
    }
    return nextAutoId++;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < headers.length) continue;

    const student_id = cols[idxStudent];
    const name = cols[idxName];

    let marker_id;
    if (idxMarker !== -1 && cols[idxMarker] !== undefined && cols[idxMarker].trim() !== '') {
      marker_id = parseInt(cols[idxMarker]);
      if (isNaN(marker_id) || marker_id < 0 || marker_id > 999) {
        marker_id = getNextCsvMarkerId();
      }
    } else {
      marker_id = getNextCsvMarkerId();
    }

    if (seenMarkers.has(marker_id) || seenStudents.has(student_id)) {
      continue;
    }

    seenMarkers.add(marker_id);
    seenStudents.add(student_id);
    parsedStudents.push({ marker_id, student_id, name });
  }

  if (parsedStudents.length === 0) {
    alert('No valid student rows found in the CSV.');
    return;
  }

  if (confirm(`Successfully loaded ${parsedStudents.length} students. Overwrite existing class list?`)) {
    classList = parsedStudents;
    saveClassList();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CROSS-ORIGIN WINDOW SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────
function initConnectionSync() {
  // Set the portal card links
  document.getElementById('open-generator-link').href = 'generator.html';
  document.getElementById('open-ocr-sheet-link').href = 'ocr_sheet.html';

  // Generate Codes button → navigate directly to generator page
  document.getElementById('generate-codes-btn').addEventListener('click', () => {
    // Save class list to localStorage so generator can read it immediately
    localStorage.setItem('showanswer_class_list', JSON.stringify(classList));
    // Navigate in same window (window.open is blocked in Android WebView)
    window.location.href = 'generator.html';
  });

  // Portal card click → same-window navigation
  document.getElementById('open-generator-link').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.setItem('showanswer_class_list', JSON.stringify(classList));
    window.location.href = 'generator.html';
  });

  // OCR sheet link click → same-window navigation
  document.getElementById('open-ocr-sheet-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'ocr_sheet.html';
  });
}

function updateStatusUI(role, connected) {
  const badge = document.getElementById(`status-${role}`);
  if (!badge) return;

  if (connected) {
    badge.textContent = 'Connected';
    badge.className = 'portal-status-badge connected';
  } else {
    badge.textContent = 'Disconnected';
    badge.className = 'portal-status-badge disconnected';
  }
}

function sendClassList(targetWin, origin) {
  if (targetWin) {
    targetWin.postMessage({ type: 'UPDATE_CLASS', classList: classList }, origin);
  }
}

// Ensure broadcast uses the dynamically resolved origin
function broadcastClassList() {
  const origin = window.location.origin;
  if (generatorWindow) {
    sendClassList(generatorWindow, origin);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PC CONNECTION DIAGNOSTIC
// ─────────────────────────────────────────────────────────────────────────────
function checkPCConnection() {
  const banner = document.getElementById('pc-connection-banner');
  if (!banner) return;

  fetch('/api/server-info')
    .then(res => res.json())
    .then(info => {
      const serverIp = info.server_ip;
      if (!serverIp) {
        banner.className = 'connection-status-banner offline-mode';
        banner.innerHTML = '<span class="status-dot"></span> <span>Running in <strong>Offline Mode</strong> (Local device database)</span>';
        banner.style.display = 'flex';
        return;
      }

      // Try fetching from laptop server via local proxy
      fetch('/api/class', { cache: 'no-store' })
        .then(res => {
          if (res.ok) {
            banner.className = 'connection-status-banner connected';
            banner.innerHTML = `<span class="status-dot"></span> <span>Connected to PC Server at <strong>${serverIp}</strong></span>`;
          } else {
            throw new Error();
          }
          banner.style.display = 'flex';
        })
        .catch(() => {
          banner.className = 'connection-status-banner disconnected';
          banner.innerHTML = `<span class="status-dot"></span> <span>⚠️ Offline - PC Server at <strong>${serverIp}</strong> is unreachable. Make sure the server is running on the PC and both devices are on the same Wi-Fi.</span>`;
          banner.style.display = 'flex';
        });
    })
    .catch(() => {
      // Standalone browser mode
      banner.style.display = 'none';
    });
}
