# WhatsApp Chatbot with RAG

A powerful WhatsApp chatbot using **Groq SDK** for AI responses and a custom **RAG (Retrieval-Augmented Generation)** engine for context-aware conversations.

## Features
- **WhatsApp Integration**: Uses `whatsapp-web.js` to connect with your WhatsApp account.
- **RAG Engine**: Retrieves relevant context from your datasets (CSV/JSON) before generating responses.
- **FAQ System**: Supports exact keyword matches for common questions.
- **Admin Dashboard**: Easy-to-use web interface to manage the bot, datasets, and knowledge base.
- **Configurable Behavior**: Customize system instructions, fallback responses, and more.

## Tech Stack
- **Backend**: Node.js, Express
- **AI**: Groq SDK (LLama 3.1)
- **WhatsApp**: whatsapp-web.js
- **Frontend**: Vanilla HTML/JS with custom CSS

## Setup
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your `.env` file with your `GROQ_API_KEY`.
4. Start the server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3001` in your browser.
6. Scan the QR code with your WhatsApp app.

## Project Structure
- `Lib/`: Core logic (RAG Engine, Dataset Manager).
- `Config/`: Configuration files.
- `Data/`: Datasets used for RAG.
- `Public/`: Frontend dashboard.
- `server-v2.js`: Main entry point.

## License
MIT
