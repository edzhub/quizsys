/* ==========================================================================
   ShowAnswer — Quiz Report Logic
   ========================================================================== */

let quizReportData = null;

window.addEventListener('DOMContentLoaded', () => {
  fetchQuizResults();

  document.getElementById('export-csv-btn').addEventListener('click', exportQuizCSV);
});

function fetchQuizResults() {
  fetch('/api/quiz/results')
    .then(res => res.json())
    .then(data => {
      if (data && data.questions && data.questions.length > 0) {
        quizReportData = data;
        populateReport();
      } else {
        alert("No active quiz results found. Please configure and run a quiz first.");
        window.location.href = "question.html";
      }
    })
    .catch(err => {
      console.error("Error loading quiz results:", err);
      document.getElementById('scoreboard-tbody').innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--danger); padding: 32px 0;">
            Failed to connect to the server. Make sure the backend is active.
          </td>
        </tr>`;
    });
}

function populateReport() {
  const questions = quizReportData.questions;
  const results = quizReportData.student_results;
  
  // 1. Calculate General Statistics
  const totalStudents = results.length;
  const participationCount = results.filter(s => Object.keys(s.answers).length > 0).length;
  const totalScoreSum = results.reduce((sum, s) => sum + s.score, 0);
  const totalPossibleSum = totalStudents * questions.length;
  
  const avgScore = totalStudents > 0 ? (totalScoreSum / totalStudents).toFixed(1) : "0.0";
  const avgAccuracy = totalPossibleSum > 0 ? ((totalScoreSum / totalPossibleSum) * 100).toFixed(0) : 0;
  
  document.getElementById('stat-avg-score').textContent = `${avgScore} / ${questions.length}`;
  document.getElementById('stat-avg-accuracy').textContent = `${avgAccuracy}%`;
  document.getElementById('stat-participation').textContent = `${participationCount} / ${totalStudents}`;

  // 2. Populate Scoreboard Table
  const scoreboardTbody = document.getElementById('scoreboard-tbody');
  scoreboardTbody.innerHTML = '';

  if (totalStudents === 0) {
    scoreboardTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:24px 0;">Class list is empty.</td></tr>`;
  } else {
    results.forEach(student => {
      const percentage = student.total > 0 ? ((student.score / student.total) * 100).toFixed(0) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${student.name}</strong></td>
        <td>${student.student_id}</td>
        <td>${student.score} / ${student.total}</td>
        <td><span class="badge" style="background-color: ${getAccuracyColor(percentage)}; padding: 3px 10px;">${percentage}%</span></td>
      `;
      scoreboardTbody.appendChild(tr);
    });
  }

  // 3. Populate Matrix Headers (Q1, Q2, etc.)
  const matrixHead = document.getElementById('matrix-thead').rows[0];
  questions.forEach((q, idx) => {
    const th = document.createElement('th');
    th.textContent = `Q${idx + 1}`;
    th.title = q.question; // Tooltip shows question text
    th.style.textAlign = 'center';
    matrixHead.appendChild(th);
  });

  // 4. Populate Matrix Body
  const matrixTbody = document.getElementById('matrix-tbody');
  matrixTbody.innerHTML = '';

  results.forEach(student => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${student.name}</strong></td>`;
    
    questions.forEach(q => {
      const td = document.createElement('td');
      td.style.textAlign = 'center';
      
      const studentAns = student.answers[q.q_index];
      const correctAns = q.correctAnswer;
      
      if (studentAns) {
        const isCorrect = (studentAns === correctAns);
        if (isCorrect) {
          td.innerHTML = `<span class="status-badge correct-badge" title="Correct: ${correctAns}">${studentAns} ✓</span>`;
        } else {
          td.innerHTML = `
            <span class="status-badge incorrect-badge" title="Selected: ${studentAns} | Correct: ${correctAns}">${studentAns} ✗</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">(${correctAns})</span>
          `;
        }
      } else {
        td.innerHTML = `<span style="color: var(--text-muted); font-weight: bold;">-</span>`;
      }
      tr.appendChild(td);
    });
    
    matrixTbody.appendChild(tr);
  });

  // 5. Populate Reference Answer Keys
  const keyContainer = document.getElementById('quiz-key-container');
  keyContainer.innerHTML = '';

  questions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.style.padding = '12px 16px';
    item.style.backgroundColor = 'var(--bg-input)';
    item.style.borderRadius = '8px';
    item.style.borderLeft = '4px solid var(--primary)';
    
    item.innerHTML = `
      <div style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">
        Q${idx + 1}: ${escapeHtml(q.question)}
      </div>
      <div style="font-size: 0.85rem; margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px;">
        <div class="${q.correctAnswer === 'A' ? 'correct-text' : ''}">A: ${escapeHtml(q.optionA)} ${q.correctAnswer === 'A' ? '✓' : ''}</div>
        <div class="${q.correctAnswer === 'B' ? 'correct-text' : ''}">B: ${escapeHtml(q.optionB)} ${q.correctAnswer === 'B' ? '✓' : ''}</div>
        <div class="${q.correctAnswer === 'C' ? 'correct-text' : ''}">C: ${escapeHtml(q.optionC)} ${q.correctAnswer === 'C' ? '✓' : ''}</div>
        <div class="${q.correctAnswer === 'D' ? 'correct-text' : ''}">D: ${escapeHtml(q.optionD)} ${q.correctAnswer === 'D' ? '✓' : ''}</div>
      </div>
    `;
    keyContainer.appendChild(item);
  });
}

function getAccuracyColor(percentage) {
  if (percentage >= 80) return 'var(--success)';
  if (percentage >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

function exportQuizCSV() {
  if (!quizReportData || quizReportData.questions.length === 0) return;

  const questions = quizReportData.questions;
  const results = quizReportData.student_results;

  // Header row
  let csv = '"Student ID","Student Name","Score","Total Possible","Percentage"';
  questions.forEach((q, idx) => {
    csv += `,"Q${idx + 1} Selected","Q${idx + 1} Result"`;
  });
  csv += '\r\n';

  // Student rows
  results.forEach(student => {
    const percentage = student.total > 0 ? ((student.score / student.total) * 100).toFixed(0) : 0;
    csv += `"${student.student_id}","${student.name}",${student.score},${student.total},"${percentage}%"`;
    
    questions.forEach(q => {
      const ans = student.answers[q.q_index] || '';
      const isCorrect = ans === q.correctAnswer ? 'Correct' : (ans ? 'Incorrect' : 'No Answer');
      csv += `,"${ans}","${isCorrect}"`;
    });
    csv += '\r\n';
  });

  const filename = `Quiz_Grades_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  if (window.ExportChannel) {
    window.ExportChannel.postMessage(JSON.stringify({
      filename: filename,
      csv: csv
    }));
  } else {
    // Download Blob trigger
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
