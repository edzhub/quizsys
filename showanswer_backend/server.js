const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8002;

// Enable CORS
app.use(cors());

// Increase payload limit for base64 image uploads
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Setup temporary upload storage configuration
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `scan_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
  }
});
const upload = multer({ storage });

// Database auto-initialization on startup
db.initDb().catch(err => {
  console.error('[Startup] Failed to initialize database tables:', err);
});

// Serve web frontend static assets (mirroring Python start_app.py behavior)
app.use(express.static(path.join(__dirname, '../QuestionScannerProject')));

// --- AUTHENTICATION APIS ---

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username || '').toLowerCase().trim();
  const password = req.body.password || '';

  try {
    const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length > 0 && userRes.rows[0].password === password) {
      // Simulate/Generate OTP code 123456
      res.json({
        status: 'otp_required',
        username: username,
        otp_simulated: '123456'
      });
    } else {
      res.json({
        status: 'error',
        message: 'Invalid username or password. (admin/admin123 or teacher/teacher123)'
      });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/auth/verify_otp', async (req, res) => {
  const username = (req.body.username || '').toLowerCase().trim();
  const otp = (req.body.otp || '').trim();

  if (otp === '123456') {
    const role = username === 'admin' ? 'Admin' : 'Teacher';
    const token = 'offline_token';
    try {
      await db.query(
        'INSERT INTO sessions (token, username, role) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role',
        [token, username, role]
      );
      res.json({
        status: 'success',
        token: token,
        role: role
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  } else {
    res.json({
      status: 'error',
      message: 'Invalid passcode. Please enter 123456.'
    });
  }
});

app.get('/api/auth/check', async (req, res) => {
  try {
    const token = 'offline_token'; // Check default mobile session
    const sessionRes = await db.query('SELECT role FROM sessions WHERE token = $1', [token]);
    if (sessionRes.rows.length > 0) {
      res.json({
        status: 'success',
        role: sessionRes.rows[0].role
      });
    } else {
      res.json({
        status: 'error',
        message: 'No active session.'
      });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- CLASS ROSTER APIS ---

app.get('/api/class', async (req, res) => {
  try {
    const rosterRes = await db.query('SELECT * FROM students ORDER BY marker_id ASC');
    res.json(rosterRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/class', async (req, res) => {
  const sid = (req.body.student_id || '').trim();
  const name = (req.body.name || '').trim();
  const classVal = (req.body.class || '10').trim().toUpperCase();
  const secVal = (req.body.section || 'A').trim().toUpperCase();

  if (!sid || !name) {
    return res.status(400).json({ status: 'error', message: 'Missing student_id or name' });
  }

  try {
    // Check next available marker_id
    const markersRes = await db.query('SELECT marker_id FROM students');
    const existing = new Set(markersRes.rows.map(r => r.marker_id));
    let nextMarkerId = 0;
    while (existing.has(nextMarkerId)) {
      nextMarkerId++;
    }

    await db.query(
      `INSERT INTO students (marker_id, student_id, name, class, section)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name, class = EXCLUDED.class, section = EXCLUDED.section`,
      [nextMarkerId, sid, name, classVal, secVal]
    );

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/server-info', (req, res) => {
  res.json({
    local_ip: '127.0.0.1',
    port: PORT
  });
});

// --- RESPONSES METADATA (SCANNER OVERLAY FEED) ---

app.get('/api/responses', async (req, res) => {
  try {
    const respRes = await db.query('SELECT * FROM responses');
    const format = {};
    respRes.rows.forEach(r => {
      format[r.student_id] = r.answer;
    });
    res.json(format);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/responses', async (req, res) => {
  try {
    const payload = req.body || {};
    for (const [sid, ans] of Object.entries(payload)) {
      await db.query(
        'INSERT INTO responses (student_id, answer) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET answer = EXCLUDED.answer',
        [sid, ans]
      );
    }
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/reset_responses', async (req, res) => {
  try {
    await db.query('DELETE FROM responses');
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- QUIZ SETUP & RESULTS APIS ---

app.get('/api/quiz/active', async (req, res) => {
  try {
    const quizRes = await db.query(
      `SELECT q_index, question, option_a AS "optionA", option_b AS "optionB", option_c AS "optionC", option_d AS "optionD", correct_answer AS "correctAnswer"
       FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC`
    );
    res.json(quizRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quiz/setup', async (req, res) => {
  try {
    const questions = req.body.questions || [];
    await db.query("DELETE FROM quiz_questions WHERE quiz_id = 'active'");
    await db.query("DELETE FROM quiz_responses WHERE quiz_id = 'active'");
    await db.query("DELETE FROM responses"); // Clear volatile overlay responses

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      await db.query(
        `INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
         VALUES ('active', $1, $2, $3, $4, $5, $6, $7)`,
        [idx, q.question || '', q.optionA || '', q.optionB || '', q.optionC || '', q.optionD || '', q.correctAnswer || '']
      );
    }
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/quiz/upload_multiple', async (req, res) => {
  try {
    const quizzes = req.body.quizzes || [];
    for (const q of quizzes) {
      const qId = q.quiz_id;
      const qList = q.questions || [];
      if (qId) {
        await db.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [qId]);
        for (let idx = 0; idx < qList.length; idx++) {
          const item = qList[idx];
          await db.query(
            `INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [qId, idx, item.question || '', item.optionA || '', item.optionB || '', item.optionC || '', item.optionD || '', item.correctAnswer || '']
          );
        }
      }
    }
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/quiz/list', async (req, res) => {
  try {
    const listRes = await db.query("SELECT DISTINCT quiz_id FROM quiz_questions WHERE quiz_id != 'active'");
    res.json(listRes.rows.map(r => r.quiz_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quiz/activate', async (req, res) => {
  const qId = req.body.quiz_id;
  if (!qId) {
    return res.status(400).json({ status: 'error', message: 'Missing quiz_id' });
  }

  try {
    await db.query("DELETE FROM quiz_questions WHERE quiz_id = 'active'");
    await db.query("DELETE FROM quiz_responses WHERE quiz_id = 'active'");
    await db.query("DELETE FROM responses"); // Clear volatile overlay responses

    await db.query(
      `INSERT INTO quiz_questions (quiz_id, q_index, question, option_a, option_b, option_c, option_d, correct_answer)
       SELECT 'active', q_index, question, option_a, option_b, option_c, option_d, correct_answer
       FROM quiz_questions WHERE quiz_id = $1`,
      [qId]
    );

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/quiz/delete', async (req, res) => {
  const qId = req.body.quiz_id;
  if (!qId) {
    return res.status(400).json({ status: 'error', message: 'Missing quiz_id' });
  }

  try {
    await db.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [qId]);
    await db.query('DELETE FROM quiz_responses WHERE quiz_id = $1', [qId]);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/quiz/response', async (req, res) => {
  const qIdx = parseInt(req.body.q_index, 10);
  const responses = req.body.responses || {};

  if (isNaN(qIdx)) {
    return res.status(400).json({ status: 'error', message: 'Invalid q_index' });
  }

  try {
    await db.query("DELETE FROM quiz_responses WHERE quiz_id = 'active' AND q_index = $1", [qIdx]);
    for (const [sid, ans] of Object.entries(responses)) {
      await db.query(
        `INSERT INTO quiz_responses (quiz_id, q_index, student_id, answer)
         VALUES ('active', $1, $2, $3)
         ON CONFLICT (quiz_id, q_index, student_id) DO UPDATE SET answer = EXCLUDED.answer`,
        [qIdx, sid, ans]
      );
    }
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/quiz/results', async (req, res) => {
  try {
    const studentsRes = await db.query('SELECT * FROM students');
    const questionsRes = await db.query("SELECT * FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC");
    const responsesRes = await db.query("SELECT * FROM quiz_responses WHERE quiz_id = 'active'");

    const questions = questionsRes.rows.map(q => ({
      q_index: q.q_index,
      question: q.question,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d,
      correctAnswer: q.correct_answer
    }));

    // Group answers by student_id
    const ansMap = {};
    responsesRes.rows.forEach(r => {
      if (!ansMap[r.student_id]) {
        ansMap[r.student_id] = {};
      }
      ansMap[r.student_id][r.q_index] = r.answer;
    });

    const studentResults = studentsRes.rows.map(s => {
      const answers = ansMap[s.student_id] || {};
      let score = 0;
      questions.forEach(q => {
        if (answers[q.q_index] === q.correctAnswer) {
          score++;
        }
      });

      return {
        student_id: s.student_id,
        name: s.name,
        score: score,
        total: questions.length,
        answers: answers
      };
    });

    res.json({
      questions,
      student_results: studentResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW BATCH SCANNING AND OFFLINE BATCH PROCESS APIS ---

// Endpoint to upload a single page of an answer sheet
app.post('/api/ocr/upload-page', upload.single('image'), async (req, res) => {
  const studentIndex = parseInt(req.body.student_index, 10);
  const pageNumber = parseInt(req.body.page_number, 10);

  if (isNaN(studentIndex) || isNaN(pageNumber) || !req.file) {
    return res.status(400).json({ status: 'error', message: 'Missing parameters or file.' });
  }

  try {
    // 1. Get or create the active pending batch
    let batchRes = await db.query("SELECT batch_id FROM scan_batches WHERE status = 'pending' ORDER BY batch_id DESC LIMIT 1");
    let batchId;
    if (batchRes.rows.length === 0) {
      const newBatch = await db.query("INSERT INTO scan_batches (status) VALUES ('pending') RETURNING batch_id");
      batchId = newBatch.rows[0].batch_id;
    } else {
      batchId = batchRes.rows[0].batch_id;
    }

    // 2. Remove existing entry for the same student index and page number in this batch
    const oldPageRes = await db.query(
      'SELECT file_path FROM scan_pages WHERE batch_id = $1 AND student_index = $2 AND page_number = $3',
      [batchId, studentIndex, pageNumber]
    );
    if (oldPageRes.rows.length > 0) {
      const oldPath = oldPageRes.rows[0].file_path;
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
      await db.query(
        'DELETE FROM scan_pages WHERE batch_id = $1 AND student_index = $2 AND page_number = $3',
        [batchId, studentIndex, pageNumber]
      );
    }

    // 3. Insert page entry
    const filePath = req.file.path;
    await db.query(
      'INSERT INTO scan_pages (batch_id, student_index, page_number, file_path) VALUES ($1, $2, $3, $4)',
      [batchId, studentIndex, pageNumber, filePath]
    );

    res.json({ status: 'success', message: `Saved page ${pageNumber} for student ${studentIndex}` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Endpoint to run the Python OCR alignment and character matching worker in a batch
app.post('/api/ocr/process-batch', async (req, res) => {
  try {
    // 1. Get active pending batch
    const batchRes = await db.query("SELECT batch_id FROM scan_batches WHERE status = 'pending' ORDER BY batch_id DESC LIMIT 1");
    if (batchRes.rows.length === 0) {
      return res.json({ status: 'error', message: 'No scans in the queue.' });
    }
    const batchId = batchRes.rows[0].batch_id;

    // 2. Fetch all pages of the batch
    const pagesRes = await db.query(
      'SELECT student_index, page_number, file_path FROM scan_pages WHERE batch_id = $1 ORDER BY student_index ASC, page_number ASC',
      [batchId]
    );
    if (pagesRes.rows.length === 0) {
      return res.json({ status: 'error', message: 'No scan files in active queue.' });
    }

    // Group pages by student index
    const studentSheets = {};
    pagesRes.rows.forEach(p => {
      if (!studentSheets[p.student_index]) {
        studentSheets[p.student_index] = {};
      }
      studentSheets[p.student_index][p.page_number] = p.file_path;
    });

    // Fetch active quiz question count and correct answers
    const questionsRes = await db.query("SELECT q_index, correct_answer FROM quiz_questions WHERE quiz_id = 'active' ORDER BY q_index ASC");
    const correctAnswers = {};
    questionsRes.rows.forEach(q => {
      correctAnswers[q.q_index] = q.correct_answer;
    });
    const totalQuestions = questionsRes.rows.length || 5;

    console.log(`[Batch Processor] Starting OCR processing for ${Object.keys(studentSheets).length} students.`);
    const processResults = [];

    // 3. Process sheets one by one
    const scriptPath = path.join(__dirname, '../QuestionScannerProject/process_ocr_page.py');

    for (const [studentIndex, pages] of Object.entries(studentSheets)) {
      const page1Path = pages[1];
      const page2Path = pages[2];

      if (!page1Path) {
        console.warn(`[Batch Processor] Warning: Student index ${studentIndex} is missing Page 1. Skipping.`);
        continue;
      }

      // Execute Python worker on Page 1
      const resP1 = await runOcrWorker(scriptPath, page1Path, 1);
      if (resP1.status === 'error') {
        console.error(`[Batch Processor] OCR Page 1 error for index ${studentIndex}:`, resP1.message);
        continue;
      }

      let roll_no = resP1.data.roll_no;
      let class_text = resP1.data.class;
      let sec_text = resP1.data.section;
      let answers = [...resP1.data.answers]; // Q1-5 answers

      // Normalize roll no
      if (!roll_no || roll_no.includes('?')) {
        roll_no = `AUTO_${studentIndex}_${Date.now().toString().slice(-4)}`;
      }

      // Process Page 2 if exists
      if (page2Path) {
        const resP2 = await runOcrWorker(scriptPath, page2Path, 2);
        if (resP2.status === 'success') {
          // Page 2 answers correspond to Q6-10
          answers = answers.concat(resP2.data.answers);
        } else {
          console.error(`[Batch Processor] OCR Page 2 error for index ${studentIndex}:`, resP2.message);
          answers = answers.concat(['?', '?', '?', '?', '?']);
        }
      }

      // Pad/slice answers to match exact quiz question count
      if (answers.length > totalQuestions) {
        answers = answers.slice(0, totalQuestions);
      } else {
        while (answers.length < totalQuestions) {
          answers.push('?');
        }
      }

      // Insert/update student details
      let name = `Student ${roll_no}`;
      const studentCheck = await db.query('SELECT name FROM students WHERE student_id = $1', [roll_no]);
      if (studentCheck.rows.length > 0) {
        name = studentCheck.rows[0].name;
        await db.query(
          'UPDATE students SET class = $1, section = $2 WHERE student_id = $3',
          [class_text, sec_text, roll_no]
        );
      } else {
        const markerRes = await db.query('SELECT marker_id FROM students');
        const existing = new Set(markerRes.rows.map(r => r.marker_id));
        let nextMarkerId = 0;
        while (existing.has(nextMarkerId)) nextMarkerId++;

        await db.query(
          'INSERT INTO students (marker_id, student_id, name, class, section) VALUES ($1, $2, $3, $4, $5)',
          [nextMarkerId, roll_no, name, class_text, sec_text]
        );
      }

      // Save student responses
      let score = 0;
      await db.query("DELETE FROM quiz_responses WHERE quiz_id = 'active' AND student_id = $1", [roll_no]);
      for (let i = 0; i < answers.length; i++) {
        const correct = correctAnswers[i];
        if (answers[i] === correct) {
          score++;
        }
        await db.query(
          "INSERT INTO quiz_responses (quiz_id, q_index, student_id, answer) VALUES ('active', $1, $2, $3)",
          [i, roll_no, answers[i]]
        );
      }

      processResults.push({
        student_id: roll_no,
        name,
        class: class_text,
        section: sec_text,
        score,
        total: totalQuestions,
        answers
      });
    }

    // 4. Mark batch as completed and delete physical files
    await db.query("UPDATE scan_batches SET status = 'completed' WHERE batch_id = $1", [batchId]);
    pagesRes.rows.forEach(p => {
      if (fs.existsSync(p.file_path)) {
        try { fs.unlinkSync(p.file_path); } catch (_) {}
      }
    });

    res.json({
      status: 'success',
      results: processResults
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Helper function to run the Python process_ocr_page script
function runOcrWorker(scriptPath, imgPath, pageNum) {
  return new Promise((resolve) => {
    // Force UTF-8 environment parameters on Windows
    const command = `set PYTHONIOENCODING=utf-8 && python "${scriptPath}" --image "${imgPath}" --page ${pageNum}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return resolve({ status: 'error', message: stderr || error.message });
      }
      try {
        // Output might contain warning logs. We extract the last line containing the JSON block.
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.find(l => l.trim().startsWith('{') && l.trim().endsWith('}'));
        if (!jsonLine) {
          return resolve({ status: 'error', message: 'Could not extract JSON block from Python output. Output: ' + stdout });
        }
        const data = JSON.parse(jsonLine);
        resolve(data);
      } catch (e) {
        resolve({ status: 'error', message: `Failed to parse Python JSON output: ${e.message}. Raw output: ${stdout}` });
      }
    });
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`[Server] Express centralized ShowAnswer server running on port ${PORT}`);
});
