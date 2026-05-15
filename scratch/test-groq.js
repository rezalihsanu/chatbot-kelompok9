require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Halo, test 123' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log('✅ Groq works:', completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ Groq error:', error.message);
  }
}
main();
