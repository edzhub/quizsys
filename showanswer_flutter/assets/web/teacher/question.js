/* ==========================================================================
   ShowAnswer — Quiz Setup Logic
   ========================================================================== */

// Initialize PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

let currentQuestionCount = 5;

window.addEventListener('DOMContentLoaded', () => {
  const phase1 = document.getElementById('phase-1-container');
  const phase2 = document.getElementById('phase-2-container');
  const btnNext = document.getElementById('btn-goto-phase-2');
  const btnBack = document.getElementById('btn-back-to-phase-1');
  const quizForm = document.getElementById('quiz-form');
  const countInput = document.getElementById('question-count');

  // File upload UI elements
  const dropZone = document.getElementById('qbank-drop-zone');
  const fileInput = document.getElementById('qbank-file-input');
  const modal = document.getElementById('qbank-modal');
  const modalClose = document.getElementById('btn-close-modal');
  const modalQuestionsList = document.getElementById('modal-questions-list');
  const modalQCount = document.getElementById('modal-q-count');
  const modalSelectedCount = document.getElementById('modal-selected-count');
  const modalTargetCount = document.getElementById('modal-target-count');
  const btnModalImport = document.getElementById('btn-modal-import');
  const btnModalRandom = document.getElementById('btn-modal-select-random');

  let parsedQuestions = [];
  let selectedQuestionsIndices = new Set();

  // Try to load any existing active quiz on startup to prefill options
  fetch('/api/quiz/active')
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        countInput.value = data.length;
        renderQuestionCards(data.length);
        
        // Prefill values
        data.forEach((q, idx) => {
          document.getElementById(`q-text-${idx}`).value = q.question;
          document.getElementById(`q-optA-${idx}`).value = q.optionA;
          document.getElementById(`q-optB-${idx}`).value = q.optionB;
          document.getElementById(`q-optC-${idx}`).value = q.optionC;
          document.getElementById(`q-optD-${idx}`).value = q.optionD;
          document.getElementById(`q-correct-${idx}`).value = q.correctAnswer;
        });
      }
    })
    .catch(err => console.warn("Could not retrieve active quiz setup:", err));

  // Drop zone drag and drop events
  if (dropZone && fileInput) {
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
      if (e.dataTransfer.files.length > 0) {
        handleMultipleFiles(e.dataTransfer.files);
      }
    });
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleMultipleFiles(e.target.files);
      }
    });
  }

  // Handle uploaded files (could be one or multiple)
  async function handleMultipleFiles(files) {
    if (files.length === 1) {
      const file = files[0];
      const parsed = await parseSingleFile(file);
      if (!parsed || parsed.length === 0) return;
      
      const quizName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      if (confirm(`You uploaded "${file.name}". Do you want to save it as a saved quiz named "${quizName}"?\n(Click Cancel to import questions manually into the form instead.)`)) {
        saveQuizzesToServer([{ quiz_id: quizName, questions: parsed }]);
      } else {
        parsedQuestions = parsed;
        const targetCount = parseInt(countInput.value) || 5;
        modalTargetCount.textContent = targetCount;
        showModal();
      }
    } else {
      const quizzesToSave = [];
      for (const file of files) {
        try {
          const parsed = await parseSingleFile(file);
          if (parsed && parsed.length > 0) {
            const quizName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            quizzesToSave.push({ quiz_id: quizName, questions: parsed });
          }
        } catch (err) {
          console.error(`Error parsing file ${file.name}:`, err);
        }
      }
      
      if (quizzesToSave.length > 0) {
        saveQuizzesToServer(quizzesToSave);
      } else {
        alert("Could not extract questions from any of the uploaded files.");
      }
    }
  }

  // Parse a single file helper
  async function parseSingleFile(file) {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          return data.map(q => ({
            question: q.question || "",
            optionA: q.optionA || q.option_a || "",
            optionB: q.optionB || q.option_b || "",
            optionC: q.optionC || q.option_c || "",
            optionD: q.optionD || q.option_d || "",
            correctAnswer: (q.correctAnswer || q.correct_answer || "A").toUpperCase()
          }));
        } else {
          alert(`Invalid JSON format in ${file.name}. Expected an array of questions.`);
          return null;
        }
      } else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let extractedText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(" ");
          extractedText += pageText + "\n";
        }
        return parseQuestionsFromText(extractedText);
      } else if (ext === 'csv') {
        const text = await file.text();
        return parseQuestionsFromCSV(text);
      } else {
        const text = await file.text();
        return parseQuestionsFromText(text);
      }
    } catch (err) {
      console.error("Error parsing file:", err);
      alert(`Failed to parse file ${file.name}: ` + err.message);
      return null;
    }
  }

  // Parse questions from CSV file
  function parseQuestionsFromCSV(text) {
    const lines = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    // Parse CSV handling quotes and commas
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i+1];
      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++; // skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\r' || char === '\n') {
          currentRow.push(currentField);
          currentField = '';
          if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
            lines.push(currentRow);
          }
          currentRow = [];
          if (char === '\r' && nextChar === '\n') {
            i++; // skip \n
          }
        } else {
          currentField += char;
        }
      }
    }
    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim() !== '')) {
        lines.push(currentRow);
      }
    }
    
    if (lines.length < 2) return [];
    
    // Header mappings
    const headers = lines[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
    
    const getIndex = (possibleNames) => {
      return headers.findIndex(h => possibleNames.includes(h));
    };
    
    const qIdx = getIndex(['question', 'q', 'questiontext', 'text']);
    const aIdx = getIndex(['optiona', 'option_a', 'choicea', 'choice_a', 'a']);
    const bIdx = getIndex(['optionb', 'option_b', 'choiceb', 'choice_b', 'b']);
    const cIdx = getIndex(['optionc', 'option_c', 'choicec', 'choice_c', 'c']);
    const dIdx = getIndex(['optiond', 'option_d', 'choiced', 'choice_d', 'd']);
    const correctIdx = getIndex(['correctanswer', 'correct_answer', 'correctoption', 'correct_option', 'answer', 'correct', 'ans']);
    
    const finalQIdx = qIdx !== -1 ? qIdx : 0;
    const finalAIdx = aIdx !== -1 ? aIdx : 1;
    const finalBIdx = bIdx !== -1 ? bIdx : 2;
    const finalCIdx = cIdx !== -1 ? cIdx : 3;
    const finalDIdx = dIdx !== -1 ? dIdx : 4;
    const finalCorrectIdx = correctIdx !== -1 ? correctIdx : 5;
    
    const parsed = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length <= Math.max(finalQIdx, finalAIdx, finalBIdx, finalCIdx, finalDIdx)) continue;
      
      const question = row[finalQIdx] ? row[finalQIdx].trim() : "";
      const optionA = row[finalAIdx] ? row[finalAIdx].trim() : "";
      const optionB = row[finalBIdx] ? row[finalBIdx].trim() : "";
      const optionC = row[finalCIdx] ? row[finalCIdx].trim() : "";
      const optionD = row[finalDIdx] ? row[finalDIdx].trim() : "";
      let correctAnswer = row[finalCorrectIdx] ? row[finalCorrectIdx].trim().toUpperCase() : "A";
      
      if (correctAnswer.includes('A') || correctAnswer === '1') correctAnswer = 'A';
      else if (correctAnswer.includes('B') || correctAnswer === '2') correctAnswer = 'B';
      else if (correctAnswer.includes('C') || correctAnswer === '3') correctAnswer = 'C';
      else if (correctAnswer.includes('D') || correctAnswer === '4') correctAnswer = 'D';
      else correctAnswer = 'A';
      
      if (question && (optionA || optionB)) {
        parsed.push({
          question,
          optionA: optionA || "Option A",
          optionB: optionB || "Option B",
          optionC: optionC || "Option C",
          optionD: optionD || "Option D",
          correctAnswer
        });
      }
    }
    return parsed;
  }

  // Save quizzes to backend
  function saveQuizzesToServer(quizzes) {
    fetch('/api/quiz/upload_multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizzes })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        alert(`Successfully saved ${quizzes.length} quiz(zes) to the server!`);
        fetchSavedQuizzes();
      } else {
        alert("Failed to save quizzes: " + data.message);
      }
    })
    .catch(err => {
      alert("Error contacting the backend: " + err.message);
    });
  }

  // Parse questions from raw string text
  function parseQuestionsFromText(text) {
    const questionRegex = /(?:^\s*|\n\s*)(?:Q(?:uestion)?\s*)?(\d+)[.)\s]+([\s\S]*?)(?=\n\s*(?:Q(?:uestion)?\s*)?\d+[.)\s]|$)/gi;
    const parsed = [];
    let match;
    while ((match = questionRegex.exec(text)) !== null) {
      const qBodyText = match[2].trim();
      
      // Look for options A/B/C/D starting indices
      const firstOptIdx = qBodyText.search(/(?:^|\s+)[A-D|a-d][.)\s]/i);
      let questionText = qBodyText;
      let optionA = "", optionB = "", optionC = "", optionD = "";
      
      if (firstOptIdx !== -1) {
        questionText = qBodyText.substring(0, firstOptIdx).trim();
        const optionsPart = qBodyText.substring(firstOptIdx);
        
        const optA_match = optionsPart.match(/(?:^|\s+)A[.)\s]+([\s\S]*?)(?=\s+[B-D][.)\s]|$)/i);
        const optB_match = optionsPart.match(/(?:^|\s+)B[.)\s]+([\s\S]*?)(?=\s+[A|C-D][.)\s]|$)/i);
        const optC_match = optionsPart.match(/(?:^|\s+)C[.)\s]+([\s\S]*?)(?=\s+[A-B|D][.)\s]|$)/i);
        const optD_match = optionsPart.match(/(?:^|\s+)D[.)\s]+([\s\S]*?)(?=\s+[A-C][.)\s]|$)/i);
        
        if (optA_match) optionA = optA_match[1].trim().split('\n')[0];
        if (optB_match) optionB = optB_match[1].trim().split('\n')[0];
        if (optC_match) optionC = optC_match[1].trim().split('\n')[0];
        if (optD_match) optionD = optD_match[1].trim().split('\n')[0];
      }
      
      questionText = questionText.replace(/\s+/g, ' ');
      
      if (questionText && (optionA || optionB)) {
        parsed.push({
          question: questionText,
          optionA: optionA || "Option A",
          optionB: optionB || "Option B",
          optionC: optionC || "Option C",
          optionD: optionD || "Option D",
          correctAnswer: "A"
        });
      }
    }
    return parsed;
  }

  // Show interactive selector modal
  function showModal() {
    selectedQuestionsIndices.clear();
    modalQCount.textContent = `${parsedQuestions.length} Found`;
    modalSelectedCount.textContent = "0";
    btnModalImport.disabled = true;
    modalQuestionsList.innerHTML = '';
    
    parsedQuestions.forEach((q, idx) => {
      const qRow = document.createElement('div');
      qRow.className = 'q-item-row';
      qRow.innerHTML = `
        <input type="checkbox" class="q-item-checkbox" id="modal-chk-${idx}">
        <div style="flex-grow: 1;">
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">Q${idx+1}: ${q.question}</div>
          <div style="font-size: 0.85rem; color: #64748b; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">
            <span><strong>A:</strong> ${q.optionA}</span>
            <span><strong>B:</strong> ${q.optionB}</span>
            <span><strong>C:</strong> ${q.optionC}</span>
            <span><strong>D:</strong> ${q.optionD}</span>
          </div>
        </div>
      `;
      
      qRow.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const chk = qRow.querySelector('input');
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change'));
        }
      });
      
      const chkInput = qRow.querySelector('input');
      chkInput.addEventListener('change', (e) => {
        if (chkInput.checked) {
          selectedQuestionsIndices.add(idx);
          qRow.classList.add('selected');
        } else {
          selectedQuestionsIndices.delete(idx);
          qRow.classList.remove('selected');
        }
        
        modalSelectedCount.textContent = selectedQuestionsIndices.size;
        btnModalImport.disabled = selectedQuestionsIndices.size === 0;
      });
      
      modalQuestionsList.appendChild(qRow);
    });
    
    modal.classList.remove('hidden');
  }

  // Modal events
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  if (btnModalRandom) {
    btnModalRandom.addEventListener('click', () => {
      const target = parseInt(countInput.value) || 5;
      selectedQuestionsIndices.clear();
      
      const maxToSelect = Math.min(target, parsedQuestions.length);
      const indices = Array.from({length: parsedQuestions.length}, (_, i) => i);
      
      // Shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      
      for (let i = 0; i < maxToSelect; i++) {
        selectedQuestionsIndices.add(indices[i]);
      }
      
      // Update modal checkboxes states
      parsedQuestions.forEach((_, idx) => {
        const chk = document.getElementById(`modal-chk-${idx}`);
        const row = chk.closest('.q-item-row');
        if (selectedQuestionsIndices.has(idx)) {
          chk.checked = true;
          row.classList.add('selected');
        } else {
          chk.checked = false;
          row.classList.remove('selected');
        }
      });
      
      modalSelectedCount.textContent = selectedQuestionsIndices.size;
      btnModalImport.disabled = selectedQuestionsIndices.size === 0;
    });
  }

  if (btnModalImport) {
    btnModalImport.addEventListener('click', () => {
      const selectedIndices = Array.from(selectedQuestionsIndices);
      const count = selectedIndices.length;
      
      countInput.value = count;
      currentQuestionCount = count;
      renderQuestionCards(count);
      
      selectedIndices.forEach((qIdx, idx) => {
        const q = parsedQuestions[qIdx];
        document.getElementById(`q-text-${idx}`).value = q.question;
        document.getElementById(`q-optA-${idx}`).value = q.optionA;
        document.getElementById(`q-optB-${idx}`).value = q.optionB;
        document.getElementById(`q-optC-${idx}`).value = q.optionC;
        document.getElementById(`q-optD-${idx}`).value = q.optionD;
        document.getElementById(`q-correct-${idx}`).value = q.correctAnswer;
      });
      
      phase1.classList.add('hidden');
      phase2.classList.remove('hidden');
      modal.classList.add('hidden');
    });
  }

  // Transition to Question details form
  btnNext.addEventListener('click', () => {
    let count = parseInt(countInput.value);
    if (isNaN(count) || count < 1 || count > 25) {
      alert("Please enter a valid number of questions between 1 and 25.");
      return;
    }
    
    currentQuestionCount = count;
    renderQuestionCards(count);
    
    phase1.classList.add('hidden');
    phase2.classList.remove('hidden');
  });

  // Transition back to count selection
  btnBack.addEventListener('click', () => {
    phase1.classList.remove('hidden');
    phase2.classList.add('hidden');
  });

  // Handle Form submit
  quizForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const questions = [];
    for (let i = 0; i < currentQuestionCount; i++) {
      questions.push({
        question: document.getElementById(`q-text-${i}`).value.trim(),
        optionA: document.getElementById(`q-optA-${i}`).value.trim(),
        optionB: document.getElementById(`q-optB-${i}`).value.trim(),
        optionC: document.getElementById(`q-optC-${i}`).value.trim(),
        optionD: document.getElementById(`q-optD-${i}`).value.trim(),
        correctAnswer: document.getElementById(`q-correct-${i}`).value
      });
    }

    // Submit quiz setup
    fetch('/api/quiz/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ questions })
    })
    .then(res => res.json())
    .then(result => {
      if (result.status === 'success') {
        window.location.href = 'scanner.html';
      } else {
        alert("Failed to configure the quiz on the server.");
      }
    })
    .catch(err => {
      console.error("Error setting up quiz:", err);
      alert("Error contacting the backend server. Please verify it is running.");
    });
  });

  // Load and render saved quizzes list
  function fetchSavedQuizzes() {
    const tbody = document.getElementById('saved-quizzes-tbody');
    if (!tbody) return;

    fetch('/api/quiz/list')
      .then(res => res.json())
      .then(quizzes => {
        tbody.innerHTML = '';
        if (!quizzes || quizzes.length === 0) {
          tbody.innerHTML = `
            <tr class="empty-row">
              <td colspan="2" style="text-align: center; color: var(--text-muted); padding: 24px 16px; font-style: italic;">No saved quizzes found. Upload files above to populate this list.</td>
            </tr>`;
          return;
        }

        quizzes.forEach(qId => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 600; color: var(--text-main); font-size: 0.95rem;">📚 ${qId}</td>
            <td style="text-align: right; padding: 12px 16px; display: flex; gap: 8px; justify-content: flex-end;">
              <button class="btn btn-success btn-sm btn-activate-quiz" data-id="${qId}" style="padding: 6px 12px; font-size: 0.8rem; font-weight:600;">▶ Activate & Start</button>
              <button class="btn btn-danger btn-sm btn-delete-quiz" data-id="${qId}" style="padding: 6px 12px; font-size: 0.8rem; font-weight:600;">🗑️ Delete</button>
            </td>
          `;
          
          tr.querySelector('.btn-activate-quiz').addEventListener('click', () => activateQuiz(qId));
          tr.querySelector('.btn-delete-quiz').addEventListener('click', () => deleteQuiz(qId));
          
          tbody.appendChild(tr);
        });
      })
      .catch(err => console.warn("Failed to load saved quizzes list:", err));
  }

  // Activate quiz
  function activateQuiz(quizId) {
    if (confirm(`Are you sure you want to activate the quiz "${quizId}"? This will clear current scanner results and start the quiz.`)) {
      fetch('/api/quiz/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quizId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          window.location.href = 'scanner.html';
        } else {
          alert("Failed to activate quiz: " + data.message);
        }
      })
      .catch(err => alert("Error activating quiz: " + err.message));
    }
  }

  // Delete quiz
  function deleteQuiz(quizId) {
    if (confirm(`Are you sure you want to delete the saved quiz "${quizId}"?`)) {
      fetch('/api/quiz/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quizId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          fetchSavedQuizzes();
        } else {
          alert("Failed to delete quiz: " + data.message);
        }
      })
      .catch(err => alert("Error deleting quiz: " + err.message));
    }
  }

  // Initial fetch of saved quizzes
  fetchSavedQuizzes();
});

function renderQuestionCards(count) {
  const container = document.getElementById('questions-cards-container');
  const badge = document.getElementById('quiz-count-badge');
  
  badge.textContent = `${count} Question${count > 1 ? 's' : ''}`;
  container.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'card question-card';
    card.innerHTML = `
      <h3 class="card-title" style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
        <span>Question ${i + 1}</span>
      </h3>
      
      <!-- Question Title -->
      <div class="form-group" style="margin-bottom: 16px;">
        <label for="q-text-${i}">Question Text</label>
        <textarea id="q-text-${i}" class="question-input" placeholder="Enter question text here..." required autocomplete="off"></textarea>
      </div>

      <!-- Options A/B/C/D -->
      <div class="form-group" style="margin-bottom: 16px;">
        <label style="margin-bottom: 8px; display: block;">Choices</label>
        
        <div class="option-group">
          <span class="option-indicator indicator-a">A</span>
          <input type="text" id="q-optA-${i}" placeholder="Choice A" required autocomplete="off">
        </div>
        
        <div class="option-group">
          <span class="option-indicator indicator-b">B</span>
          <input type="text" id="q-optB-${i}" placeholder="Choice B" required autocomplete="off">
        </div>
        
        <div class="option-group">
          <span class="option-indicator indicator-c">C</span>
          <input type="text" id="q-optC-${i}" placeholder="Choice C" required autocomplete="off">
        </div>
        
        <div class="option-group">
          <span class="option-indicator indicator-d">D</span>
          <input type="text" id="q-optD-${i}" placeholder="Choice D" required autocomplete="off">
        </div>
      </div>

      <!-- Correct Answer Selection -->
      <div class="form-group" style="margin-bottom: 8px;">
        <label for="q-correct-${i}">Correct Option</label>
        <select id="q-correct-${i}" required style="width: 100%;">
          <option value="" disabled selected>-- Select correct answer letter --</option>
          <option value="A">Option A</option>
          <option value="B">Option B</option>
          <option value="C">Option C</option>
          <option value="D">Option D</option>
        </select>
      </div>
    `;
    container.appendChild(card);
  }
}
