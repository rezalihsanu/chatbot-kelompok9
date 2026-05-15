const STOPWORDS_ID = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'atau', 'pada', 'adalah',
  'ini', 'itu', 'dalam', 'juga', 'karena', 'agar', 'sebagai', 'saat', 'oleh', 'akan',
  'bisa', 'dapat', 'sudah', 'belum', 'kami', 'kamu', 'anda', 'saya', 'aku', 'kita',
  'mereka', 'apa', 'siapa', 'kapan', 'dimana', 'bagaimana', 'kenapa', 'jika', 'kalau'
]);

// Simple synonyms/normalization map for common user terms
const SYNONYM_RE = /\b(kids|kid|children|child|anak|jr)\b/gi;

/**
 * RAGEngine handles document tokenization, indexing (TF-IDF), and context retrieval.
 */
class RAGEngine {
  constructor() {
    this.cache = {
      signature: '',
      index: null
    };
  }

  /**
   * Tokenizes text by removing special characters and filtering out stopwords.
   * @param {string} text 
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text) return [];
    // Normalize common synonyms before tokenization (e.g. 'kids' -> 'junior')
    const normalized = text
      .toLowerCase()
      .replace(SYNONYM_RE, 'junior')
      .replace(/[^a-z0-9\s]/g, ' ');

    // Keep short tokens of length >= 2 (so abbreviations like 'jr' aren't dropped)
    return normalized
      .split(/\s+/)
      .filter(token => token.length > 1 && !STOPWORDS_ID.has(token));
  }

  /**
   * Splits long text into overlapping chunks for better retrieval granularity.
   */
  splitIntoChunks(text, chunkSize = 700, overlap = 120) {
    if (!text) return [];
    const normalized = text.replace(/\r/g, '').trim();
    if (!normalized) return [];

    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(start + chunkSize, normalized.length);
      
      // Try to break at newline for better context preservation
      if (end < normalized.length) {
        const lastBreak = normalized.lastIndexOf('\n', end);
        if (lastBreak > start + 120) {
          end = lastBreak;
        }
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk.length > 40) {
        chunks.push(chunk);
      }

      if (end >= normalized.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return chunks;
  }

  /**
   * Builds a Term Frequency map for a list of tokens.
   */
  buildTfMap(tokens) {
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    return tf;
  }

  /**
   * Builds the TF-IDF index from a list of documents.
   */
  buildRagIndex(documents) {
    if (!documents || documents.length === 0) {
      return { idf: new Map(), vectors: [] };
    }

    const tokenizedDocs = documents.map(doc => this.tokenize(doc.text));
    const docFreq = new Map();

    tokenizedDocs.forEach(tokens => {
      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(token => {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      });
    });

    const totalDocs = Math.max(documents.length, 1);
    const idf = new Map();
    docFreq.forEach((freq, token) => {
      idf.set(token, Math.log((totalDocs + 1) / (freq + 1)) + 1);
    });

    const vectors = tokenizedDocs.map((tokens, idx) => {
      const tf = this.buildTfMap(tokens);
      const vector = new Map();
      let normSquared = 0;

      tf.forEach((count, token) => {
        const weight = count * (idf.get(token) || 0);
        vector.set(token, weight);
        normSquared += weight * weight;
      });

      return {
        source: documents[idx].source,
        text: documents[idx].text,
        vector,
        norm: Math.sqrt(normSquared)
      };
    });

    return { idf, vectors };
  }

  /**
   * Retrieves the most relevant context items for a given query.
   */
  retrieveContext(query, documents, topK = 3) {
    if (!documents || documents.length === 0) return [];
    
    const { idf, vectors } = this.buildRagIndex(documents);
    if (!vectors.length) return [];

    const queryTokens = this.tokenize(query);
    if (!queryTokens.length) return [];

    const queryTf = this.buildTfMap(queryTokens);
    const queryVector = new Map();
    let queryNormSquared = 0;

    queryTf.forEach((count, token) => {
      const weight = count * (idf.get(token) || 0);
      if (weight > 0) {
        queryVector.set(token, weight);
        queryNormSquared += weight * weight;
      }
    });

    const queryNorm = Math.sqrt(queryNormSquared);
    if (!queryNorm) return [];

    return vectors
      .map(item => {
        if (!item.norm) return { ...item, score: 0 };
        
        let dotProduct = 0;
        queryVector.forEach((qWeight, token) => {
          const dWeight = item.vector.get(token);
          if (dWeight) dotProduct += qWeight * dWeight;
        });

        return {
          source: item.source,
          text: item.text,
          score: dotProduct / (queryNorm * item.norm)
        };
      })
      .filter(item => item.score > 0.1) // Increased threshold for stricter relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

  }

  /**
   * Formats context items into a readable block for the LLM.
   */
  buildContextBlock(contextItems) {
    if (!contextItems || !contextItems.length) return '';
    return contextItems
      .map((item, idx) => {
        const cleanText = item.text.replace(/\s+/g, ' ').trim();
        return `[Konteks ${idx + 1}] Sumber: ${item.source}\n${cleanText}`;
      })
      .join('\n\n');
  }

  clearCache() {
    this.cache.signature = '';
    this.cache.index = null;
  }
}

module.exports = RAGEngine;
