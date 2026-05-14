const fs = require('fs');
const path = require('path');

/**
 * DatasetManager handles loading, parsing, and managing datasets (CSV and JSON).
 */
class DatasetManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'Data');
    this.ensureDataDir();
    this.datasets = new Map();
    this.loadAllDatasets();
  }

  /**
   * Parses a CSV line handling quoted values and commas.
   */
  parseCsvLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  /**
   * Builds a text block from CSV row data based on headers.
   * Includes mapping for cryptic Shopee headers and a clearer format.
   */
  buildTextFromCsvRow(headers, row) {
    const mapping = {
      'contents href': 'Link Produk',
      'whitespace-normal': 'Nama Produk',
      'font-medium 2': 'Harga',
      'h-4': 'Diskon',
      'truncate': 'Kategori/Label',
      'flex-none': 'Rating',
      'truncate 2': 'Jumlah Terjual',
      'truncate 3': 'Waktu Pengiriman',
      'ml-[3px]': 'Lokasi Toko'
    };

    const details = headers
      .map((header, idx) => {
        const val = row[idx] ? row[idx].trim() : '';
        if (!val || val === '-') return null;
        
        const cleanHeader = header.replace(/^"|"$/g, '').trim();
        const readableHeader = mapping[cleanHeader] || cleanHeader;
        
        // Skip purely technical fields and images
        const key = cleanHeader.toLowerCase();
        if (key.includes('src')) return null;
        if (key.includes('image') && !mapping[key]) return null;
        if (key.includes('h-') && !mapping[key]) return null;
        if (key.includes('pointer-events')) return null;
        if (key.includes('svg')) return null;
        
        // Ensure Link Produk is a full URL
        if (readableHeader === 'Link Produk' && !val.startsWith('http')) return null;

        return `${readableHeader}: ${val}`;
      })
      .filter(Boolean);

    if (details.length === 0) return null;

    // Put Nama Produk and Harga at the top if they exist
    const nameIdx = details.findIndex(d => d.startsWith('Nama Produk:'));
    if (nameIdx > -1) {
      const name = details.splice(nameIdx, 1)[0];
      details.unshift(name);
    }

    return details.join('\n');
  }



  /**
   * Extracts a readable label for a CSV row to be used as a title/source.
   */
  extractCsvLabel(row) {
    for (const val of row) {
      const clean = val ? val.trim() : '';
      if (!clean) continue;
      if (/^https?:\/\//i.test(clean)) continue;
      if (/^data:/i.test(clean)) continue;
      if (/^[\d.,%+-]+$/.test(clean)) continue;
      if (clean.length < 4) continue;
      return clean;
    }
    return 'Baris';
  }

  /**
   * Loads and parses a CSV dataset file.
   */
  loadCsvDataset(filePath, datasetName) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length < 2) {
        return {
          name: datasetName,
          file: filePath,
          data: { documents: [] },
          loadedAt: new Date().toISOString()
        };
      }

      const headers = this.parseCsvLine(lines[0]);
      const documents = lines.slice(1).map(line => {
        const row = this.parseCsvLine(line);
        const text = this.buildTextFromCsvRow(headers, row);
        if (!text) return null;
        
        return {
          source: `${datasetName}/${this.extractCsvLabel(row)}`,
          text
        };
      }).filter(Boolean);

      return {
        name: datasetName,
        file: filePath,
        data: {
          metadata: { name: datasetName, type: 'csv' },
          documents
        },
        loadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error parsing CSV ${datasetName}:`, error.message);
      return null;
    }
  }

  /**
   * Simple CSV line parser that handles quoted values correctly.
   */
  parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Ensures the data directory exists.
   */

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Scans and loads all datasets from the data directory.
   */
  loadAllDatasets() {
    try {
      const files = fs.readdirSync(this.dataDir);
      for (const file of files) {
        const filePath = path.join(this.dataDir, file);
        const datasetName = path.parse(file).name;

        try {
          if (file.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            this.datasets.set(datasetName, {
              name: datasetName,
              file: filePath,
              data: data,
              loadedAt: new Date().toISOString()
            });
            console.log(`✅ Loaded JSON dataset: ${datasetName}`);
          } else if (file.endsWith('.csv')) {
            const dataset = this.loadCsvDataset(filePath, datasetName);
            if (dataset) {
              this.datasets.set(datasetName, dataset);
              console.log(`✅ Loaded CSV dataset: ${datasetName}`);
            }
          }
        } catch (err) {
          console.error(`❌ Error loading ${file}:`, err.message);
        }
      }
    } catch (error) {
      console.error('Error scanning data directory:', error.message);
    }
  }

  /**
   * Returns all documents across all loaded datasets.
   */
  getAllDocuments() {
    const allDocs = [];
    for (const [name, ds] of this.datasets) {
      // Handle documents array
      if (Array.isArray(ds.data.documents)) {
        ds.data.documents.forEach(doc => {
          allDocs.push({
            source: `${name}/${doc.source || 'unknown'}`,
            text: doc.text || ''
          });
        });
      }
      // Handle FAQ array
      if (Array.isArray(ds.data.faq)) {
        ds.data.faq.forEach(faq => {
          allDocs.push({
            source: `${name}/FAQ: ${faq.question || 'unknown'}`,
            text: `${faq.question}\n${faq.answer}`
          });
        });
      }
    }
    return allDocs;
  }

  /**
   * Returns documents for a specific dataset.
   */
  getDatasetDocuments(name) {
    const ds = this.datasets.get(name);
    if (!ds) return [];

    const docs = [];
    if (Array.isArray(ds.data.documents)) {
      ds.data.documents.forEach(doc => {
        docs.push({
          source: `${name}/${doc.source || 'unknown'}`,
          text: doc.text || ''
        });
      });
    }
    if (Array.isArray(ds.data.faq)) {
      ds.data.faq.forEach(faq => {
        docs.push({
          source: `${name}/FAQ: ${faq.question || 'unknown'}`,
          text: `${faq.question}\n${faq.answer}`
        });
      });
    }
    return docs;
  }

  /**
   * Saves or updates a JSON dataset.
   */
  saveDataset(name, data) {
    try {
      const filePath = path.join(this.dataDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      this.datasets.set(name, {
        name: name,
        file: filePath,
        data: data,
        loadedAt: new Date().toISOString()
      });
      
      return { success: true, message: `Dataset ${name} saved` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Lists all available datasets with metadata.
   */
  listDatasets() {
    return Array.from(this.datasets.values()).map(d => ({
      name: d.name,
      loadedAt: d.loadedAt,
      documentCount: this.getDatasetDocuments(d.name).length
    }));
  }

  /**
   * Clears and reloads all datasets.
   */
  reloadDatasets() {
    this.datasets.clear();
    this.loadAllDatasets();
  }
}

module.exports = DatasetManager;