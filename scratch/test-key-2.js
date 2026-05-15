require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Halo, ketik "OK" jika api key ini valid' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log('✅ AI BERHASIL DIHUBUNGI:', completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ MASIH ERROR:', error.message);
  }
}
main();
