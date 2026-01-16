// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite');

const app = express();
const port = process.env.PORT || 3001;

// Configuração do CORS
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Configuração do Multer para armazenamento em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const results = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  // TENTATIVA DE CORREÇÃO DE CODIFICAÇÃO:
  // Usando 'cp1252' para decodificação. Se ainda houver problemas, podemos tentar 'latin1'.
  const decodedStream = bufferStream.pipe(iconv.decodeStream('cp1252')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: [';', ','], // Tenta ambos os separadores
      mapHeaders: ({ header }) => {
        // Mapeamento explícito para corrigir caracteres bugados nos cabeçalhos
        // e padronizar nomes para o frontend esperar.
        let cleanedHeader = header.trim();

        // Correções comuns de caracteres bugados e padronização
        cleanedHeader = cleanedHeader
          .replace(/ServiÁo/g, 'Serviço')
          .replace(/TÈcnico/g, 'Técnico')
          .replace(/N?mero Referencia/g, 'Numero Referencia') // Para N�mero Referencia
          .replace(/Data Limite/g, 'Data Limite') // Para Data Limite
          .replace(/CNPJ \/ CPF/g, 'CNPJ / CPF') // Para CNPJ / CPF
          .replace(/Justificativa do Abono/g, 'Justificativa do Abono'); // Para Justificativa do Abono

        return cleanedHeader;
      }
    }))
    .on('data', (data) => {
      const cleanedData = {};
      for (const key in data) {
        let value = data[key];
        if (typeof value === 'string') {
          value = value.trim();
          // Remove "="" e aspas de CNPJ/CPF se ainda vierem do CSV
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
  console.log(`Backend rodando na porta ${port}`);
});
