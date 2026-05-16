require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');

// Local modules
const RAGEngine = require('./Lib/rag');
const DatasetManager = require('./Lib/dataset');

// Global error handler untuk mencegah server crash saat whatsapp-web.js logout dan file terkunci (EBUSY)
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('EBUSY')) {
    console.warn('⚠️ Diabaikan: File session terkunci saat logout (EBUSY). Ini aman diabaikan.');
  } else {
    console.error('Unhandled Rejection:', reason);
  }
});

process.on('uncaughtException', (err) => {
  if (err && err.message && err.message.includes('EBUSY')) {
    console.warn('⚠️ Diabaikan: File session terkunci (EBUSY).');
  } else {
    console.error('Uncaught Exception:', err);
  }
});

// --- Configuration & Constants ---
const app = express();
const PORT = process.env.PORT || 3001;
const KNOWLEDGE_FILE = path.join(__dirname, 'knowledge.json');
const BEHAVIOR_FILE = path.join(__dirname, 'Config', 'behavior.json');

// --- Middlewares ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('Public'));

// Admin Dashboard Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// --- Instances ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const rag = new RAGEngine();
const datasets = new DatasetManager();

// --- Bot State ---
const bots = {}; // Store states per category: bots[category] = { client, qrCodeData, isReady, isCleaning, isInitializing }
const handledMessageIds = new Set();

function getBotState(category) {
  if (!bots[category]) {
    bots[category] = {
      client: null,
      qrCodeData: null,
      isReady: false,
      isCleaning: false,
      isInitializing: false,
      phoneNumber: null
    };
  }
  return bots[category];
}

// --- Helper Functions ---

function loadKnowledge() {
  try {
    if (!fs.existsSync(KNOWLEDGE_FILE)) {
      const initial = { keywords: {}, responses: {} };
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
  } catch (error) {
    console.error('Error loading knowledge:', error);
    return { keywords: {}, responses: {} };
  }
}

function saveKnowledge(data) {
  try {
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2));
    rag.clearCache();
    return true;
  } catch (error) {
    console.error('Error saving knowledge:', error);
    return false;
  }
}

function loadBehavior() {
  try {
    if (!fs.existsSync(BEHAVIOR_FILE)) return null;
    return JSON.parse(fs.readFileSync(BEHAVIOR_FILE, 'utf8'));
  } catch (error) {
    console.error('Error loading behavior config:', error.message);
    return null;
  }
}

function saveBehavior(obj) {
  try {
    fs.mkdirSync(path.dirname(BEHAVIOR_FILE), { recursive: true });
    fs.writeFileSync(BEHAVIOR_FILE, JSON.stringify(obj, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving behavior config:', error.message);
    return false;
  }
}

async function getAIResponse(message, contextItems = [], behavior = null) {
  try {
    const contextBlock = rag.buildContextBlock(contextItems);
    
    if (!behavior) {
      behavior = loadBehavior() || {
        system_instructions: 'Jawab hanya berdasarkan konteks yang diberikan.',
        fallback_response: 'Mohon maaf, untuk item itu belum ada di toko kami.',
        max_sentences: 2,
        language: 'id'
      };
    }

    // Return fallback if no context is found
    if (!contextBlock || contextItems.length === 0) {
      return behavior.fallback_response;
    }

    const systemMessage = [
      behavior.system_instructions,
      `DATA SOURCE: Anda HANYA diperbolehkan menggunakan informasi dari konteks produk yang diberikan (bersumber dari katalog Shopee kami).`,
      `PANTANGAN: Jangan menyebutkan merk lain atau memberikan saran di luar data produk.`,
      `FALLBACK: Jika konteks tidak memadai atau pertanyaan tidak relevan dengan produk, jawab: ${behavior.fallback_response}`,
      `FORMAT: Jawab maksimal ${behavior.max_sentences || 2} kalimat. Bahasa: ${behavior.language || 'id'}.`
    ].filter(Boolean).join(' ');


    const userMessage = `Konteks:\n${contextBlock}\n\nPertanyaan: ${message}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 200),
      temperature: 0.1
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error getting AI response:', error.message);
    return null;
  }
}

// --- WhatsApp Client Logic ---

function initializeClient(category) {
  const state = getBotState(category);
  if (state.client) return state.client;

  // Use distinct clientId per category to separate sessions
  state.client = new Client({
    authStrategy: new LocalAuth({ clientId: `whatsapp-bot-${category}` }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-web-resources', '--disable-sync', '--disable-translate',
        '--disable-extensions', '--disable-default-apps'
      ],
      timeout: 120000
    }
  });

  state.client.on('qr', (qr) => {
    console.log(`📱 QR Code Generated for ${category}`);
    state.qrCodeData = qr;
    qrcode.generate(qr, { small: true });
  });

  state.client.on('ready', () => {
    console.log(`✅ Bot [${category}] is ready!`);
    state.isReady = true;
    state.isCleaning = false;
    state.phoneNumber = state.client.info && state.client.info.wid ? state.client.info.wid.user : null;
  });

  state.client.on('authenticated', () => console.log(`🔐 Client [${category}] authenticated`));

  state.client.on('disconnected', (reason) => {
    console.log(`❌ Client [${category}] disconnected:`, reason);
    state.isReady = false;
    state.client = null;
    state.qrCodeData = null;
  });

  state.client.on('message', (msg) => handleIncomingMessage(msg, category));
  state.client.on('message_create', (msg) => handleIncomingMessage(msg, category));

  return state.client;
}

async function handleIncomingMessage(msg, category) {
  try {
    const messageId = msg?.id?._serialized;
    if (!messageId || msg.fromMe || handledMessageIds.has(messageId)) return;

    // Track handled messages to avoid loops
    handledMessageIds.add(messageId);
    setTimeout(() => handledMessageIds.delete(messageId), 5 * 60 * 1000);

    // Filter personal chats only
    const isPersonal = msg.from.endsWith('@c.us') || msg.from.endsWith('@lid');
    if (!isPersonal || msg.from.endsWith('@status')) return;

    console.log(`📩 Message from ${msg.from}: ${msg.body}`);

    // Show typing indicator
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
    } catch (e) { /* ignore */ }

    const knowledge = loadKnowledge();
    const query = msg.body.toLowerCase().trim();

    // 1. Check exact keyword matches in knowledge
    if (knowledge.responses[query]) {
      await msg.reply(knowledge.responses[query]);
      console.log(`🎯 Replied with FAQ keyword match on [${category}]`);
      return;
    }

    // 2. Fallback to RAG + AI
    // Restrict retrieval to specific category dataset
    const allDocs = datasets.getDatasetDocuments(category) || [];
    if (allDocs.length === 0) {
      console.warn(`WARNING: No documents found for category ${category}. Falling back to all documents.`);
      allDocs.push(...datasets.getAllDocuments());
    }
    
    const contextItems = rag.retrieveContext(msg.body, allDocs, Number(process.env.RAG_TOP_K || 3));
    console.log(`🔍 RAG Retrieved ${contextItems.length} context(s) for [${category}]`);

    const behavior = loadBehavior();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 15000)
    );

    try {
      const aiResponse = await Promise.race([
        getAIResponse(msg.body, contextItems, behavior),
        timeoutPromise
      ]);

      if (aiResponse) {
        await msg.reply(aiResponse);
        console.log('🤖 Replied with AI response');
      } else {
        await msg.reply('Maaf, saya tidak memahami pesan Anda. Silakan coba lagi.');
      }
    } catch (err) {
      console.error('AI Processing Error:', err.message);
      await msg.reply('Maaf, terjadi kesalahan dalam memproses pesan Anda.');
    }
  } catch (error) {
    console.error('Message Handler Error:', error.message);
  }
}

async function startBot(category) {
  const state = getBotState(category);
  if (state.isReady || state.isInitializing) return { success: false, message: `Bot [${category}] sudah berjalan` };
  if (state.isCleaning) return { success: false, message: `Harap tunggu, bot [${category}] sedang dihentikan` };
  
  state.isInitializing = true;
  try {
    const instance = initializeClient(category);
    await instance.initialize();
    state.isInitializing = false;
    return { success: true, message: `Bot [${category}] sedang dimulai, silakan scan QR` };
  } catch (error) {
    state.isInitializing = false;
    state.client = null;
    throw error;
  }
}

// --- API Routes ---

// API to list available bot categories based on datasets
app.get('/api/bot/categories', (req, res) => {
  res.json({ categories: datasets.listDatasets() });
});

// Bot Status
app.get('/api/bot/status', (req, res) => {
  const category = req.query.category;
  if (!category) return res.status(400).json({ message: 'Category is required' });
  const state = getBotState(category);
  res.json({ 
    isReady: state.isReady, 
    isCleaning: state.isCleaning, 
    isInitializing: state.isInitializing, 
    hasQRCode: !!state.qrCodeData,
    phoneNumber: state.phoneNumber
  });
});

app.post('/api/bot/start', async (req, res) => {
  const category = req.body.category || req.query.category;
  if (!category) return res.status(400).json({ success: false, message: 'Category is required' });
  try {
    const result = await startBot(category);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/bot/stop', async (req, res) => {
  const category = req.body.category || req.query.category;
  if (!category) return res.status(400).json({ success: false, message: 'Category is required' });
  
  const state = getBotState(category);
  if (!state.client) return res.json({ success: false, message: `Bot [${category}] tidak aktif` });
  
  state.isCleaning = true;
  state.isReady = false;
  state.qrCodeData = null;
  const target = state.client;
  state.client = null;
  
  res.json({ success: true, message: `Bot [${category}] sedang dihentikan` });
  
  try {
    await target.destroy();
  } catch (err) {
    console.error(`Error stopping client [${category}]:`, err.message);
  } finally {
    state.isCleaning = false;
  }
});

app.get('/api/bot/qr', (req, res) => {
  const category = req.query.category;
  if (!category) return res.status(400).json({ message: 'Category is required' });
  const state = getBotState(category);
  res.json({ qr: state.qrCodeData });
});

// Datasets
app.get('/api/datasets', (req, res) => {
  res.json({
    datasets: datasets.listDatasets(),
    totalDocuments: datasets.getAllDocuments().length
  });
});

app.get('/api/datasets/:name', (req, res) => {
  const docs = datasets.getDatasetDocuments(req.params.name);
  if (!docs.length) return res.status(404).json({ message: 'Dataset not found' });
  res.json({ documents: docs });
});

app.post('/api/datasets', (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) return res.status(400).json({ message: 'Name and data required' });
  res.json(datasets.saveDataset(name, data));
});

// Knowledge (FAQ)
app.get('/api/knowledge/keywords', (req, res) => res.json(loadKnowledge()));

app.post('/api/knowledge/keyword', (req, res) => {
  const { keyword, response } = req.body;
  if (!keyword || !response) return res.status(400).json({ success: false, message: 'Required fields missing' });
  
  const knowledge = loadKnowledge();
  knowledge.responses[keyword.toLowerCase().trim()] = response;
  
  if (saveKnowledge(knowledge)) {
    res.json({ success: true, message: 'Keyword saved' });
  } else {
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
});

app.delete('/api/knowledge/keyword/:keyword', (req, res) => {
  const kw = decodeURIComponent(req.params.keyword).toLowerCase();
  const knowledge = loadKnowledge();
  
  if (knowledge.responses[kw]) {
    delete knowledge.responses[kw];
    saveKnowledge(knowledge);
    res.json({ success: true, message: 'Keyword deleted' });
  } else {
    res.status(404).json({ success: false, message: 'Not found' });
  }
});

// Behavior Config
app.get('/api/behavior', (req, res) => {
  const config = loadBehavior();
  if (!config) return res.status(404).json({ message: 'Not found' });
  res.json(config);
});

app.post('/api/behavior', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ message: 'Invalid data' });
  if (saveBehavior(req.body)) {
    res.json({ success: true, message: 'Behavior updated' });
  } else {
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`🏠 Welcome Page: http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`📦 Datasets Loaded: ${datasets.listDatasets().length}\n`);

  if (process.env.AUTO_START_BOT !== 'false') {
    console.log('Use Admin Dashboard to start bots manually per category.');
  }
});
