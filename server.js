// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite');

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
  'Chamado', 'Numero Referencia', 'Contratante', 'Serviço', 'Status',
  'Data Limite', 'Cliente', 'CNPJ / CPF', 'Cidade', 'Técnico',
  'Prestador', 'Justificativa do Abono',
];

const normalizeHeader = (header) => {
  if (typeof header !== 'string') return '';
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
};

const headerMapping = {
  'chamado': 'Chamado', 'numeroreferencia': 'Numero Referencia', 'contratante': 'Contratante',
  'servico': 'Serviço', 'status': 'Status', 'datalimite': 'Data Limite',
  'cliente': 'Cliente', 'cnpjcpf': 'CNPJ / CPF', 'cidade': 'Cidade',
  'tecnico': 'Técnico', 'prestador': 'Prestador', 'justificativadoabono': 'Justificativa do Abono',
  'nºchamado': 'Chamado', 'nreferencia': 'Numero Referencia', 'data limite': 'Data Limite',
  'cnpj/cpf': 'CNPJ / CPF', 'justificativa': 'Justificativa do Abono', 'justificativaabono': 'Justificativa do Abono',
};

app.post('/upload', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado.' });
  }

  try {
    const buffer = req.file.buffer;
    const decodedContent = iconv.decode(buffer, 'latin1');

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(decodedContent, 'utf8'));

    let originalHeaders = []; // Para armazenar os cabeçalhos do CSV

    bufferStream
      .pipe(csv({
        separator: ';',
        mapHeaders: ({ header }) => {
          // Captura os cabeçalhos originais para uso posterior no mapeamento
          originalHeaders.push(header);
          return header; // Retorna o cabeçalho original para o csv-parser
        }
      }))
      .on('data', (data) => {
        const row = {};
        expectedFrontendHeaders.forEach(expectedHeader => {
          let foundValue = ''; // Inicializa com string vazia

          // Tenta encontrar o valor usando o mapeamento e os cabeçalhos originais
          for (const originalHeader of originalHeaders) {
            const normalizedOriginalHeader = normalizeHeader(originalHeader);
            if (headerMapping[normalizedOriginalHeader] === expectedHeader) {
              foundValue = data[originalHeader];
              break;
            }
          }

          // Se não encontrou pelo mapeamento, tenta encontrar diretamente pelo nome esperado
          if (foundValue === '' && data[expectedHeader] !== undefined) {
            foundValue = data[expectedHeader];
          }

          // Se ainda não encontrou, tenta encontrar pelo nome normalizado
          if (foundValue === '') {
            const normalizedExpectedHeader = normalizeHeader(expectedHeader);
            for (const originalHeader of originalHeaders) {
              if (normalizeHeader(originalHeader) === normalizedExpectedHeader) {
                foundValue = data[originalHeader];
                break;
              }
            }
          }

          // Tratamento especial para CNPJ / CPF: remover o prefixo '=' e aspas
          if (expectedHeader === 'CNPJ / CPF' && typeof foundValue === 'string') {
            foundValue = foundValue.replace(/^="/, '').replace(/"$/, '');
          }

          row[expectedHeader] = foundValue !== undefined ? String(foundValue).trim() : ''; // Garante string e remove espaços
        });
        results.push(row);
      })
      .on('end', () => {
        if (results.length === 0) {
          return res.status(200).json([]);
        }
        res.json(results);
      })
      .on('error', (err) => {
        console.error('Erro ao processar CSV stream:', err);
        // CORREÇÃO: Sempre retorna JSON em caso de erro
        res.status(500).json({ error: 'Erro ao processar o arquivo CSV.', details: err.message });
      });

  } catch (error) {
    console.error('Erro no upload handler:', error);
    // CORREÇÃO: Sempre retorna JSON em caso de erro
    res.status(500).json({ error: 'Erro interno do servidor ao processar o upload.', details: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Backend da Tabela de OSs está online!');
});

app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend escutando na porta ${PORT_TO_USE}`);
  console.log(`CORS permitido para: ${frontendUrl}`);
});
