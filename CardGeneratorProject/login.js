// login.js - Classroom Hub Auth Portal

let currentUsername = "";
let simulatedOtp = "";

window.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const otpForm = document.getElementById('otp-form');
  const credSection = document.getElementById('credentials-section');
  const otpSection = document.getElementById('otp-section');
  const errorBanner = document.getElementById('error-banner');
  const otpErrorBanner = document.getElementById('otp-error-banner');
  const btnBack = document.getElementById('btn-back');
  
  // Single OTP input - auto-focus on show

  // Handle back button from OTP screen
  btnBack.addEventListener('click', () => {
    otpSection.style.display = 'none';
    credSection.style.display = 'block';
    hideToast();
  });

  // Handle credentials submit
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'otp_required') {
        currentUsername = data.username;
        simulatedOtp = data.otp_simulated;
        
        // Show OTP section
        credSection.style.display = 'none';
        otpSection.style.display = 'block';
        document.getElementById('otp-input').value = '';
        document.getElementById('otp-input').focus();
        
        // Show toast with OTP for easy user input
        showToast(simulatedOtp);
      } else {
        errorBanner.textContent = data.message || "Invalid credentials.";
        errorBanner.style.display = 'block';
      }
    })
    .catch(err => {
      errorBanner.textContent = "Server error. Is the backend running?";
      errorBanner.style.display = 'block';
      console.error(err);
    });
  });

  // Handle OTP submit
  otpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    otpErrorBanner.style.display = 'none';

    // Read single OTP input
    const otp = document.getElementById('otp-input').value.trim();
    if (otp.length !== 6) {
      otpErrorBanner.textContent = "Please enter the full 6-digit code.";
      otpErrorBanner.style.display = 'block';
      return;
    }

    fetch('/api/auth/verify_otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, otp })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        // Save session details
        localStorage.setItem('showanswer_session_token', data.token);
        localStorage.setItem('showanswer_session_username', currentUsername);
        localStorage.setItem('showanswer_session_role', data.role);
        
        hideToast();
        
        // Redirect based on role
        if (data.role === 'Admin') {
          window.location.href = 'index.html';
        } else {
          // Redirect to port 8002 for teacher (Quiz Setup)
          window.location.href = 'http://' + window.location.hostname + ':8002/index.html';
        }
      } else {
        otpErrorBanner.textContent = data.message || "Invalid or expired passcode.";
        otpErrorBanner.style.display = 'block';
        document.getElementById('otp-input').value = '';
        document.getElementById('otp-input').focus();
      }
    })
    .catch(err => {
      otpErrorBanner.textContent = "Verification failed. Server is unreachable.";
      otpErrorBanner.style.display = 'block';
      console.error(err);
    });
  });

  // Copy toast button setup
  document.getElementById('btn-copy-otp').addEventListener('click', () => {
    navigator.clipboard.writeText(simulatedOtp).then(() => {
      const copyBtn = document.getElementById('btn-copy-otp');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    });
  });
});

function showToast(code) {
  const toast = document.getElementById('otp-toast');
  document.getElementById('otp-toast-code').textContent = code;
  toast.classList.add('show');
}

function hideToast() {
  const toast = document.getElementById('otp-toast');
  toast.classList.remove('show');
}
