/* ==========================================================================
   ShowAnswer — Classroom Hub Logic (Hub Portal - Port 8000)
   ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let classList = [];
let generatorWindow = null;
let scannerWindow = null;

// Default Class List
const DEFAULT_CLASS = [
  { marker_id: 0, student_id: "220001", name: "Akshay Sharma" },
  { marker_id: 1, student_id: "220002", name: "Priya Reddy" },
  { marker_id: 2, student_id: "220003", name: "Rohan Mehta" },
  { marker_id: 3, student_id: "220004", name: "Sneha Iyer" },
  { marker_id: 4, student_id: "220005", name: "Karan Patel" },
  { marker_id: 5, student_id: "220006", name: "Divya Nair" },
  { marker_id: 6, student_id: "220007", name: "Arjun Verma" },
  { marker_id: 7, student_id: "220008", name: "Pooja Krishnan" },
  { marker_id: 8, student_id: "220009", name: "Rahul Gupta" },
  { marker_id: 9, student_id: "220010", name: "Ananya Das" }
];

// ─────────────────────────────────────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initClassList();
  initCSVUpload();
  initConnectionSync();
});

// ─────────────────────────────────────────────────────────────────────────────
//  CLASS LIST MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function initClassList() {
  const hostname = window.location.hostname;
  
  // First attempt to load class list from the shared server database API
  fetch(`/api/class`)
    .then(res => res.json())
    .then(serverClass => {
      if (serverClass && serverClass.length > 0) {
        classList = serverClass;
        localStorage.setItem('showanswer_class_list', JSON.stringify(classList));
        updateClassTable();
        broadcastClassList();
      } else {
        // Fallback to local storage or defaults
        const saved = localStorage.getItem('showanswer_class_list');
        if (saved) {
          try {
            classList = JSON.parse(saved);
          } catch(e) {
            classList = [...DEFAULT_CLASS];
          }
        } else {
          classList = [...DEFAULT_CLASS];
        }
        updateClassTable();
        // Upload initial class list to database
        saveClassList();
      }
    })
    .catch(err => {
      console.warn("Class database API offline. Falling back to local storage:", err);
      const saved = localStorage.getItem('showanswer_class_list');
      if (saved) {
        try {
          classList = JSON.parse(saved);
        } catch(e) {
          classList = [...DEFAULT_CLASS];
        }
      } else {
        classList = [...DEFAULT_CLASS];
      }
      updateClassTable();
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
  const origin = window.location.origin;
  
  // Set the portal card links dynamically to match the current origin
  document.getElementById('open-generator-link').href = `/generator.html`;

  // Catch click triggers to track reference handles
  document.getElementById('open-generator-link').addEventListener('click', (e) => {
    e.preventDefault();
    generatorWindow = window.open(`/generator.html`, 'ShowAnswerGenerator');
  });

  document.getElementById('generate-codes-btn').addEventListener('click', () => {
    generatorWindow = window.open(`/generator.html`, 'ShowAnswerGenerator');
  });

  // Periodically check if windows were closed by the user
  setInterval(() => {
    if (generatorWindow && generatorWindow.closed) {
      generatorWindow = null;
      updateStatusUI('generator', false);
    }
  }, 1000);

  // Message Handler for incoming connections
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'CONNECT') {
      if (msg.role === 'generator') {
        generatorWindow = event.source;
        updateStatusUI('generator', true);
        sendClassList(generatorWindow, origin);
      }
    } else if (msg.type === 'REQUEST_CLASS') {
      if (event.source === generatorWindow) {
        sendClassList(generatorWindow, origin);
      }
    }
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
