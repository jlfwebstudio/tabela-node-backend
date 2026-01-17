// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite'); // Para lidar com codificação de caracteres

const app = express();
const PORT_TO_USE = process.env.PORT || 3001;

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const expectedFrontendHeaders = [
  'Chamado',
  'Numero Referencia',
  'Contratante',
  'Serviço',
  'Status',
  'Data Limite',
  'Cliente',
  'CNPJ / CPF',
  'Cidade',
  'Técnico',
  'Prestador',
  'Justificativa do Abono',
];

// Função auxiliar para normalizar cabeçalhos (remove acentos, caixa baixa, espaços)
const normalizeHeader = (header) => {
  if (typeof header !== 'string') return '';
  return header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Mapeamento de cabeçalhos mais robusto
const headerMapping = {
  'chamado': 'Chamado',
  'numeroreferencia': 'Numero Referencia',
  'nreferencia': 'Numero Referencia',
  'contratante': 'Contratante',
  'servico': 'Serviço',
  'serviço': 'Serviço',
  'servio': 'Serviço',
  'status': 'Status',
  'datalimite': 'Data Limite',
  'data limite': 'Data Limite',
  'cliente': 'Cliente',
  'nomecliente': 'Cliente', // Mapeia "Nome Cliente" para "Cliente"
  'cnpjcpf': 'CNPJ / CPF',
  'cnpj/cpf': 'CNPJ / CPF',
  'c.n.p.j/c.p.f': 'CNPJ / CPF',
  'cidade': 'Cidade',
  'tecnico': 'Técnico',
  'tecnico': 'Técnico', // Com acento
  'prestador': 'Prestador',
  'justificativadoabono': 'Justificativa do Abono',
  'justificativaabono': 'Justificativa do Abono',
};

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const results = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: ';',
      mapHeaders: ({ header }) => {
        const normalized = normalizeHeader(header);
        return headerMapping[normalized] || header.trim(); // Usa o mapeado ou o original limpo
      }
    }))
    .on('data', (data) => {
      const processedRow = {};
      expectedFrontendHeaders.forEach(header => {
        let value = data[header] !== undefined && data[header] !== null ? String(data[header]).trim() : '';

        // Limpeza específica para CNPJ / CPF: remove tudo que não for dígito
        if (header === 'CNPJ / CPF' && value) {
          value = value.replace(/[^\d]/g, '');
        }
        processedRow[header] = value;
      });
      results.push(processedRow);
    })
    .on('end', () => {
      if (results.length === 0) {
        console.warn('CSV processado, mas nenhum dado válido foi extraído.');
        return res.status(200).json([]);
      }
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV.', details: error.message });
    });
});

app.get('/', (req, res) => {
  res.send('Backend da Tabela de OSs está online!');
});

app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend rodando na porta ${PORT_TO_USE}`);
  console.log(`CORS permitido para: ${frontendUrl}`);
});
