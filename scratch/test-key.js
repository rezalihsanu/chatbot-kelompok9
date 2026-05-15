require('dotenv').config();
const Groq = require('groq-sdk');

const rawKey = process.env.GROQ_API_KEY;
console.log('Raw key length:', rawKey.length);
console.log('Raw key starts with space?', rawKey.startsWith(' '));
console.log('Raw key ends with space?', rawKey.endsWith(' '));

const groq = new Groq({ apiKey: rawKey.trim() });

async function main() {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Halo' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log('✅ Groq works with trimmed key!');
  } catch (error) {
    console.error('❌ Groq error still:', error.message);
  }
}
main();
