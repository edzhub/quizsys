/* ==========================================================================
   ShowAnswer — Card Generator Logic (Port 8001)
   ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let classList = [];

function normalizeClassList(list) {
  if (!Array.isArray(list)) return [];

  return list
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      marker_id: Number(item.marker_id ?? 0),
      student_id: String(item.student_id ?? ''),
      name: String(item.name ?? ''),
      class: item.class ?? '',
      section: item.section ?? ''
    }))
    .filter(item => item.student_id || item.name);
}

function applyClassList(list) {
  classList = normalizeClassList(list);
  onClassUpdated();
}

function loadClassListFromStorage() {
  try {
    const saved = localStorage.getItem('showanswer_class_list');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return normalizeClassList(parsed);
  } catch (err) {
    console.warn('Could not restore class list from local storage:', err);
    return [];
  }
}

function startGenerator() {
  try {
    initCardGenerator();
  } catch (e) {
    console.error("Error initializing card generator:", e);
  }
  try {
    establishHandshake();
  } catch (e) {
    console.error("Error establishing handshake:", e);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startGenerator);
} else {
  startGenerator();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECTION HANDSHAKE
// ─────────────────────────────────────────────────────────────────────────────
function establishHandshake() {
  const syncStatus = document.getElementById('sync-status');
  syncStatus.textContent = '🔄 Loading class list...';

  // 1. Immediately load from localStorage (set by class_hub.js when navigating here)
  const cachedClass = loadClassListFromStorage();
  if (cachedClass.length > 0) {
    applyClassList(cachedClass);
  }

  // 2. Also fetch from server to get latest data (and update cache)
  fetch('/api/class', { cache: 'no-store' })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        // Server has data — use it and update localStorage
        localStorage.setItem('showanswer_class_list', JSON.stringify(data));
        applyClassList(data);
      } else if (cachedClass.length > 0) {
        // Server empty but we have cache — keep it
        applyClassList(cachedClass);
      }
    })
    .catch(err => {
      console.warn('Could not retrieve class list from network API:', err);
      // Already applied cache above — nothing more to do
    });

  // 3. Listen for localStorage changes from other tabs
  window.addEventListener('storage', (event) => {
    if (event.key === 'showanswer_class_list') {
      applyClassList(loadClassListFromStorage());
    }
  });
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
  if (window.PrintChannel) {
    const dict = new AR.Dictionary('DICT_4X4_1000');
    const sortedClass = [...classList].sort((a, b) => a.marker_id - b.marker_id);
    const cardsPayload = sortedClass.map(student => {
      const codeBin = dict.codeList[student.marker_id];
      return {
        name: student.name,
        student_id: student.student_id,
        code: codeBin
      };
    });
    window.PrintChannel.postMessage(JSON.stringify({
      type: 'print_cards',
      cards: cardsPayload
    }));
  } else {
    const printContainer = document.getElementById('print-container');
    printContainer.innerHTML = '';
    const dict = new AR.Dictionary('DICT_4X4_1000');
    const sortedClass = [...classList].sort((a, b) => a.marker_id - b.marker_id);

    sortedClass.forEach(student => {
      const page = document.createElement('div');
      page.className = 'print-card-page';
      page.innerHTML = `
        <div class="print-card-header">
          <h1>${student.name}</h1>
          <p>Student ID: ${student.student_id}</p>
        </div>
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
    window.print();
  }
}
