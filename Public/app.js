/**
 * Frontend logic for the WhatsApp Chatbot Dashboard.
 */

const API_URL = '/api';

// --- UI Utilities ---
let currentCategory = '';

async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/bot/categories`);
    const data = await response.json();
    const select = document.getElementById('botCategory');
    if (data.categories && data.categories.length > 0) {
      select.innerHTML = '';
      data.categories.forEach(catItem => {
        // Handle if API returns object { name: '...' } or string
        const catName = typeof catItem === 'object' ? catItem.name : catItem;
        
        const opt = document.createElement('option');
        opt.value = catName;
        opt.textContent = catName.charAt(0).toUpperCase() + catName.slice(1);
        select.appendChild(opt);
      });
      currentCategory = select.value;
      checkBotStatus();
    } else {
      select.innerHTML = '<option value="">Tidak ada dataset</option>';
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function categoryChanged() {
  currentCategory = document.getElementById('botCategory').value;
  checkBotStatus();
}

function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

function switchTab(tabId) {
  // Update active tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }

  // Update active content panes
  document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');

  // Specific tab actions
  if (tabId === 'knowledge') {
    loadKeywords();
  }
}

// --- Bot Management ---

async function checkBotStatus() {
  if (!currentCategory) return;
  try {
    const response = await fetch(`${API_URL}/bot/status?category=${currentCategory}`);
    const data = await response.json();
    
    const elements = {
      dot: document.getElementById('statusDot'),
      text: document.getElementById('statusText'),
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      qr: document.getElementById('qrSection'),
      ready: document.getElementById('readySection')
    };

    if (data.isReady) {
      elements.dot.classList.add('active');
      elements.text.textContent = `Bot [${currentCategory}] Connected`;
      elements.startBtn.style.display = 'none';
      elements.stopBtn.style.display = 'inline-block';
      elements.qr.style.display = 'none';
      elements.ready.style.display = 'block';
    } else if (data.hasQRCode) {
      elements.dot.classList.remove('active');
      elements.text.textContent = 'Waiting for QR Scan';
      elements.startBtn.style.display = 'none';
      elements.stopBtn.style.display = 'inline-block';
      elements.qr.style.display = 'block';
      elements.ready.style.display = 'none';
      loadQRCode();
    } else if (data.isInitializing) {
      elements.dot.classList.remove('active');
      elements.text.textContent = 'Initializing...';
      elements.startBtn.style.display = 'none';
      elements.stopBtn.style.display = 'none';
      elements.qr.style.display = 'none';
      elements.ready.style.display = 'none';
    } else {
      elements.dot.classList.remove('active');
      elements.text.textContent = 'Bot Offline';
      elements.startBtn.style.display = 'inline-block';
      elements.stopBtn.style.display = 'none';
      elements.qr.style.display = 'none';
      elements.ready.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking status:', error);
  }
}

async function loadQRCode() {
  if (!currentCategory) return;
  try {
    const response = await fetch(`${API_URL}/bot/qr?category=${currentCategory}`);
    const data = await response.json();
    if (data.qr) {
      const container = document.getElementById('qrcode');
      container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.qr)}" style="width: 280px; height: 280px;">`;
    }
  } catch (error) {
    console.error('Error loading QR:', error);
  }
}

async function startBot() {
  if (!currentCategory) return;
  try {
    const response = await fetch(`${API_URL}/bot/start`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: currentCategory })
    });
    const data = await response.json();
    showNotification(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      checkBotStatus();
      
      // Check more frequently during startup
      const interval = setInterval(checkBotStatus, 2000);
      setTimeout(() => clearInterval(interval), 120000);
    }
  } catch (error) {
    showNotification('Error starting bot: ' + error.message, 'error');
  }
}

async function stopBot() {
  if (!currentCategory) return;
  try {
    const btn = document.getElementById('stopBtn');
    btn.disabled = true;
    
    const response = await fetch(`${API_URL}/bot/stop`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: currentCategory })
    });
    const data = await response.json();
    showNotification(data.message, data.success ? 'success' : 'error');
    
    btn.disabled = false;
    checkBotStatus();
  } catch (error) {
    showNotification('Error stopping bot: ' + error.message, 'error');
    document.getElementById('stopBtn').disabled = false;
  }
}

// --- Knowledge Management ---

async function loadKeywords() {
  try {
    const response = await fetch(`${API_URL}/knowledge/keywords`);
    const data = await response.json();
    const container = document.getElementById('keywordItems');
    
    container.innerHTML = '';
    
    if (Object.keys(data.responses).length === 0) {
      container.innerHTML = '<p class="empty-state">Belum ada keyword. Tambahkan keyword baru di atas!</p>';
      return;
    }

    Object.entries(data.responses).forEach(([kw, res]) => {
      const item = document.createElement('div');
      item.className = 'keyword-item';
      item.innerHTML = `
        <div class="keyword-info">
          <strong>${kw}</strong>
          <p>${res}</p>
        </div>
        <div class="keyword-actions">
          <button class="btn" onclick="editKeyword('${kw}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteKeyword('${kw}')">Hapus</button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading keywords:', error);
  }
}

async function saveKeyword() {
  const keyword = document.getElementById('keyword').value.trim().toLowerCase();
  const response = document.getElementById('response').value.trim();
  
  if (!keyword || !response) {
    showNotification('Keyword dan response harus diisi!', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/knowledge/keyword`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, response })
    });
    const data = await res.json();
    showNotification(data.message, data.success ? 'success' : 'error');
    
    if (data.success) {
      document.getElementById('keyword').value = '';
      document.getElementById('response').value = '';
      loadKeywords();
    }
  } catch (error) {
    showNotification('Error saving keyword: ' + error.message, 'error');
  }
}

function editKeyword(kw) {
  document.getElementById('keyword').value = kw;
  // Load current response into the field
  fetch(`${API_URL}/knowledge/keywords`)
    .then(r => r.json())
    .then(data => {
      if (data.responses[kw]) {
        document.getElementById('response').value = data.responses[kw];
      }
    });
  document.getElementById('keyword').focus();
}

async function deleteKeyword(kw) {
  if (!confirm(`Hapus kata kunci "${kw}"?`)) return;
  
  try {
    const response = await fetch(`${API_URL}/knowledge/keyword/${encodeURIComponent(kw)}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    showNotification(data.message, data.success ? 'success' : 'error');
    
    if (data.success) {
      loadKeywords();
    }
  } catch (error) {
    showNotification('Error deleting keyword: ' + error.message, 'error');
  }
}

// --- Event Listeners ---

document.getElementById('startBtn').addEventListener('click', startBot);
document.getElementById('stopBtn').addEventListener('click', stopBot);

// --- Initialization ---

loadCategories();
setInterval(checkBotStatus, 5000);
