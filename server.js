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
        if (cleanedHeader.includes('Chamado')) return 'Chamado';
        if (cleanedHeader.includes('Numero') && cleanedHeader.includes('Referencia')) return 'Numero Referencia';
        if (cleanedHeader.includes('Contratante')) return 'Contratante';
        if (cleanedHeader.includes('Serviço') || cleanedHeader.includes('Servico')) return 'Serviço';
        if (cleanedHeader.includes('Status')) return 'Status';
        if (cleanedHeader.includes('Data') && cleanedHeader.includes('Limite')) return 'Data Limite';
        // Adicionando mapeamento para "Nome Cliente"
        if (cleanedHeader.includes('Cliente') || cleanedHeader.includes('Nome Cliente')) return 'Cliente';
        if (cleanedHeader.includes('CNPJ') || cleanedHeader.includes('CPF')) return 'CNPJ / CPF';
        if (cleanedHeader.includes('Cidade')) return 'Cidade';
        if (cleanedHeader.includes('Técnico') || cleanedHeader.includes('Tecnico')) return 'Técnico';
        if (cleanedHeader.includes('Prestador')) return 'Prestador';
        if (cleanedHeader.includes('Justificativa') && cleanedHeader.includes('Abono')) return 'Justificativa do Abono';

        // Se o cabeçalho não for mapeado explicitamente, retorna o cabeçalho original limpo
        return cleanedHeader;
      }
    }))
    .on('data', (data) => results.push(data))
    .on('end', () => {
      // Filtra os resultados para incluir apenas os cabeçalhos esperados pelo frontend
      // e garante a ordem correta das chaves em cada objeto
      const formattedResults = results.map(row => {
        const newRow = {};
        expectedFrontendHeaders.forEach(header => {
          // Garante que todos os cabeçalhos esperados estejam presentes, mesmo que vazios
          newRow[header] = row[header] !== undefined ? row[header] : '';
        });
        return newRow;
      });
      res.json(formattedResults);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV.' });
    });
});

// Endpoint de saúde para verificar se o backend está online
app.get('/', (req, res) => {
  res.send('Backend da Tabela de OSs está online!');
});

app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend rodando na porta ${PORT_TO_USE}`);
});
