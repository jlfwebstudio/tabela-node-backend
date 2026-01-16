// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite');

const app = express();
const port = process.env.PORT || 3001;

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const results = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  // Usando 'cp1252' para decodificação. Se ainda houver problemas, podemos tentar 'latin1' ou outras.
  const decodedStream = bufferStream.pipe(iconv.decodeStream('cp1252')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: [';', ','],
      mapHeaders: ({ header }) => {
        // Normaliza o cabeçalho do CSV para uma versão sem acentos e em maiúsculas.
        // O frontend precisará usar esses nomes normalizados para referenciar as colunas.
        const normalizedHeader = header
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
        return normalizedHeader;
      }
    }))
    .on('data', (data) => {
      const cleanedData = {};
      for (const key in data) {
        let value = data[key];
        if (typeof value === 'string') {
          value = value.trim();
          if (key === 'CNPJ / CPF' && value.startsWith('="') && value.endsWith('"')) {
            value = value.substring(2, value.length - 1);
          }
        }
        cleanedData[key] = value;
      }
      results.push(cleanedData);
    })
    .on('end', () => {
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV.' });
    });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
