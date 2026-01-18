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

// Configuração do CORS para permitir requisições do frontend
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Configuração do Multer para upload de arquivos em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Cabeçalhos esperados no frontend, na ordem desejada
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

// Mapeamento de cabeçalhos para normalizar nomes inconsistentes do CSV
const headerMapping = {
  'chamado': 'Chamado',
  'numeroreferencia': 'Numero Referencia',
  'numeroref': 'Numero Referencia',
  'contratante': 'Contratante',
  'servico': 'Serviço',
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

// Função para normalizar cabeçalhos (remover acentos, espaços, caixa baixa)
const normalizeHeader = (header) => {
  if (typeof header !== 'string') return '';
  return header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
};

// CORREÇÃO: Endpoint de upload alterado para '/upload'
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Nenhum arquivo enviado.');
  }

  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  const results = [];
  const headers = [];

  // Decodifica de latin1 para utf8
  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({ separator: ';' })) // Assumindo que o CSV usa ponto e vírgula como separador
    .on('headers', (rawHeaders) => {
      // Mapeia os cabeçalhos do CSV para os cabeçalhos esperados no frontend
      rawHeaders.forEach(rawHeader => {
        const normalizedRawHeader = normalizeHeader(rawHeader);
        const matchingFrontendHeader = expectedFrontendHeaders.find(
          fh => normalizeHeader(fh) === normalizedRawHeader
        );
        if (matchingFrontendHeader) {
          headers.push({ raw: rawHeader, frontend: matchingFrontendHeader });
        } else {
          headers.push({ raw: rawHeader, frontend: null }); // Marcar para ignorar
        }
      });
    })
    .on('data', (data) => {
      const row = {};
      let isEmptyRow = true;

      headers.forEach(headerMap => {
        if (headerMap.frontend) {
          const value = data[headerMap.raw] ? String(data[headerMap.raw]).trim() : ''; // Garante que é string
          row[headerMap.frontend] = value;
          if (value !== '') {
            isEmptyRow = false;
          }
        }
      });

      if (!isEmptyRow) {
        results.push(row);
      }
    })
    .on('end', () => {
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).send('Erro ao processar o arquivo CSV.');
    });
});

// Endpoint de teste para verificar se o backend está online
app.get('/', (req, res) => {
  res.send('Backend da Tabela de OSs está online!');
});

app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend rodando na porta ${PORT_TO_USE}`);
  console.log(`CORS configurado para ${frontendUrl}`);
});
