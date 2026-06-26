/* ==========================================================================
   ShowAnswer — Card Generator Logic (Port 8001)
   ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let classList = [];

// ─────────────────────────────────────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initCardGenerator();
  establishHandshake();
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECTION HANDSHAKE
// ─────────────────────────────────────────────────────────────────────────────
function establishHandshake() {
  const syncStatus = document.getElementById('sync-status');

  // Always attempt to pull the current class list from the network API first
  fetch('/api/class')
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        classList = data;
        onClassUpdated();
      }
    })
    .catch(err => console.warn("Could not retrieve class list from network API:", err));
  
  if (window.opener) {
    // Send handshake
    window.opener.postMessage({ type: 'CONNECT', role: 'generator' }, '*');
    
    // Listen for incoming messages from Classroom Hub
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'UPDATE_CLASS') {
        classList = msg.classList || [];
        onClassUpdated();
      }
    });
  } else {
    syncStatus.textContent = '⚠️ Standalone Mode (No Classroom Hub)';
    syncStatus.className = 'sync-indicator unsynced';
  }
}

function onClassUpdated() {
  const syncStatus = document.getElementById('sync-status');
  const previewPage = document.getElementById('card-preview-page');
  const noRoster = document.getElementById('no-roster-placeholder');
  const select = document.getElementById('card-preview-select');
  const printBtn = document.getElementById('print-cards-btn');

  if (classList.length === 0) {
    syncStatus.textContent = '⚠️ Empty Class List';
    syncStatus.className = 'sync-indicator unsynced';
    
    select.disabled = true;
    select.innerHTML = '<option value="">-- Class list is empty --</option>';
    printBtn.disabled = true;
    previewPage.style.display = 'none';
    noRoster.style.display = 'block';
    return;
  }

  // Update Status
  syncStatus.textContent = '🟢 Class Synced';
  syncStatus.className = 'sync-indicator synced';
  
  // Re-enable UI
  select.disabled = false;
  printBtn.disabled = false;
  previewPage.style.display = 'flex';
  noRoster.style.display = 'none';

  updateGeneratorDropdown();
}

// ─────────────────────────────────────────────────────────────────────────────
//  PREVIEW & PRINT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function initCardGenerator() {
  // Set the back link dynamically
  const backLink = document.getElementById('back-to-hub-link');
  if (backLink) {
    backLink.href = `/`;
  }

  const select = document.getElementById('card-preview-select');
  select.addEventListener('change', () => {
    const markerId = select.value;
    if (markerId !== '') {
      renderPreviewCard(parseInt(markerId));
    }
  });

  document.getElementById('print-cards-btn').addEventListener('click', () => {
    generateAndPrintCards();
  });
}

function updateGeneratorDropdown() {
  const select = document.getElementById('card-preview-select');
  select.innerHTML = '';
  
  // Sort class list by name
  const sortedByName = [...classList].sort((a, b) => a.name.localeCompare(b.name));
  
  sortedByName.forEach(student => {
    const opt = document.createElement('option');
    opt.value = student.marker_id;
    opt.textContent = `${student.name} (${student.student_id})`;
    select.appendChild(opt);
  });

  // Preview first student by default
  renderPreviewCard(sortedByName[0].marker_id);
}

function renderPreviewCard(markerId) {
  const student = classList.find(s => s.marker_id === markerId);
  if (!student) return;

  document.getElementById('preview-card-name').textContent = student.name;
  document.getElementById('preview-card-id').textContent = `Student ID: ${student.student_id}`;
  document.getElementById('preview-card-slot').textContent = `(card slot ${String(student.marker_id).padStart(2, '0')})`;

  // Generate SVG marker from dictionary (uses the corrected bit-reversed byte representation)
  const svgContainer = document.getElementById('preview-aruco-svg');
  const dict = new AR.Dictionary('DICT_4X4_1000');
  svgContainer.innerHTML = dict.generateSVG(student.marker_id);
}

function generateAndPrintCards() {
  const printContainer = document.getElementById('print-container');
  printContainer.innerHTML = '';

  const dict = new AR.Dictionary('DICT_4X4_1000');
  
  // Sort cards by marker ID
  const sortedClass = [...classList].sort((a, b) => a.marker_id - b.marker_id);

  sortedClass.forEach(student => {
    const page = document.createElement('div');
    page.className = 'print-card-page';
    page.innerHTML = `
      <div class="print-card-header">
        <h1>${student.name}</h1>
        <p>Student ID: ${student.student_id}</p>
      </div>

      <!-- Edge labels positioned relative to the ArUco container -->
      <div class="print-aruco-wrapper">
        <div class="print-label-edge print-edge-top">A</div>
        <div class="print-label-edge print-edge-right">B</div>
        <div class="print-label-edge print-edge-bottom">C</div>
        <div class="print-label-edge print-edge-left">D</div>
        
        <div class="print-aruco-container">
          ${dict.generateSVG(student.marker_id)}
        </div>
      </div>

      <div class="print-card-footer">
        <div class="hint-text">↑ Upright = A  |  → Rotate 90° CW = B  |  ↓ Flip = C  |  ← Rotate 90° CCW = D</div>
      </div>
    `;
    printContainer.appendChild(page);
  });

  // Open native print panel
  window.print();
}
