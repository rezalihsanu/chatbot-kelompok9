const DatasetManager = require('../Lib/dataset');
const RAGEngine = require('../Lib/rag');

const datasets = new DatasetManager();
const rag = new RAGEngine();

console.log('Total documents:', datasets.getAllDocuments().length);

const query = 'apakah ada jam tangan eiger?';
const docs = datasets.getAllDocuments();
const results = rag.retrieveContext(query, docs, 3);

console.log('\nQuery:', query);
console.log('Results:', JSON.stringify(results, null, 2));

const query2 = 'eiger ataca';
const results2 = rag.retrieveContext(query2, docs, 3);
console.log('\nQuery:', query2);
console.log('Results:', JSON.stringify(results2, null, 2));
