// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite'); // Para lidar com codificação de caracteres

const app = express();
// Usa a porta fornecida pelo ambiente (Render) ou 3001 como fallback para desenvolvimento local
const PORT_TO_USE = process.env.PORT || 3001;

// Configuração do CORS para permitir requisições do frontend Vercel
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Configuração do Multer para armazenar o arquivo CSV em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Define os cabeçalhos esperados pelo frontend, na ordem e com a grafia exata
// Isso garante que o frontend sempre receba as chaves esperadas
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

// Endpoint para upload de arquivo CSV
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const results = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  // Decodifica o buffer do arquivo CSV usando 'latin1' (comum em CSVs brasileiros)
  // e depois o codifica para 'utf8' para processamento consistente
  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: ';', // Define explicitamente o ponto e vírgula como separador
      mapHeaders: ({ header }) => {
        let cleanedHeader = header.trim();

        // Mapeamento robusto para padronizar os nomes dos cabeçalhos do CSV
        // para os nomes esperados pelo frontend, corrigindo variações e caracteres bugados.
        if (cleanedHeader.includes('CHAMADO')) return 'Chamado';
        else if (cleanedHeader.includes('NUMERO REFERENCIA') || cleanedHeader.includes('N?MERO REFERENCIA')) return 'Numero Referencia';
        else if (cleanedHeader.includes('CONTRATANTE')) return 'Contratante';
        else if (cleanedHeader.includes('SERVICO') || cleanedHeader.includes('SERVIÇO') || cleanedHeader.includes('SERVI?O')) return 'Serviço';
        else if (cleanedHeader.includes('STATUS')) return 'Status';
        else if (cleanedHeader.includes('DATA LIMITE')) return 'Data Limite';
        else if (cleanedHeader.includes('CLIENTE') || cleanedHeader.includes('NOME CLIENTE') || cleanedHeader.includes('NOME_CLIENTE')) return 'Cliente';
        else if (cleanedHeader.includes('CNPJ / CPF') || cleanedHeader.includes('CNPJCPF') || cleanedHeader.includes('C.N.P.J / C.P.F')) return 'CNPJ / CPF';
        else if (cleanedHeader.includes('CIDADE')) return 'Cidade';
        else if (cleanedHeader.includes('TECNICO') || cleanedHeader.includes('TÉCNICO') || cleanedHeader.includes('T?CNICO')) return 'Técnico';
        else if (cleanedHeader.includes('PRESTADOR')) return 'Prestador';
        else if (cleanedHeader.includes('JUSTIFICATIVA DO ABONO') || cleanedHeader.includes('JUSTIFICATIVA ABONO')) return 'Justificativa do Abono';

        // Se o cabeçalho não for mapeado explicitamente, ele será mantido como está.
        // Isso é um fallback, mas o ideal é mapear todos os cabeçalhos relevantes.
        return cleanedHeader;
      }
    }))
    .on('data', (data) => {
      const processedRow = {};
      // Garante que cada linha tenha todas as chaves esperadas pelo frontend,
      // preenchendo com string vazia se o valor original for nulo/indefinido.
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
      // Retorna um array vazio se nenhum dado válido foi extraído, mas com status 200 OK
      if (results.length === 0) {
        console.warn('CSV processado, mas nenhum dado válido foi extraído. Verifique o formato do CSV e os separadores.');
        return res.status(200).json([]);
      }
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV.', details: error.message });
    });
});

// Endpoint de saúde para verificar se o backend está online
app.get('/', (req, res) => {
  res.send('Backend da Tabela de OS está online!');
});

// Inicia o servidor na porta configurada
app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend escutando na porta ${PORT_TO_USE}`);
  console.log(`CORS permitido para: ${frontendUrl}`);
});