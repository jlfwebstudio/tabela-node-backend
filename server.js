// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite'); // Importa a biblioteca iconv-lite

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

  // CORREÇÃO AQUI: Usar iconv-lite para decodificar o buffer para UTF-8, assumindo que a origem é latin1
  // Se o CSV for UTF-8 puro, esta linha pode ser removida.
  // Se o CSV for de outra codificação (ex: cp1252), ajuste 'latin1' para 'cp1252'.
  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: [';', ','], // Tenta ';' primeiro, depois ','
      mapHeaders: ({ header }) => {
        // Normaliza os cabeçalhos para remover acentos e espaços extras
        const normalizedHeader = header
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, ' ')
          .trim();

        // Mapeamento de cabeçalhos
        if (normalizedHeader.includes('CHAMADO')) return 'Chamado';
        if (normalizedHeader.includes('NUMERO REFERENCIA')) return 'Numero Referencia';
        if (normalizedHeader.includes('CONTRATANTE')) return 'Contratante';
        if (normalizedHeader.includes('SERVICO')) return 'Serviço';
        if (normalizedHeader.includes('STATUS')) return 'Status';
        if (normalizedHeader.includes('DATA LIMITE')) return 'Data Limite';
        if (normalizedHeader.includes('CLIENTE')) return 'Cliente';
        if (normalizedHeader.includes('CNPJ / CPF')) return 'CNPJ / CPF';
        if (normalizedHeader.includes('CIDADE')) return 'Cidade';
        if (normalizedHeader.includes('TECNICO')) return 'Técnico';
        if (normalizedHeader.includes('PRESTADOR')) return 'Prestador';
        if (normalizedHeader.includes('JUSTIFICATIVA DO ABONO')) return 'Justificativa do Abono';
        return header; // Retorna o cabeçalho original se não houver mapeamento
      }
    }))
    .on('data', (data) => {
      // Limpeza e formatação de dados
      const cleanedData = {};
      for (const key in data) {
        let value = data[key];
        if (typeof value === 'string') {
          value = value.trim();
          // Remove o sinal de igual e aspas duplas de CNPJ/CPF
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
