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

// Definir os cabeçalhos esperados pelo frontend para garantir que todas as chaves existam
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

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const results = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  // CORREÇÃO DE CODIFICAÇÃO: Usando 'latin1' para decodificação.
  // Se ainda houver problemas com caracteres bugados, podemos tentar 'cp1252'.
  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: [';', ','], // Tenta ambos os separadores
      mapHeaders: ({ header }) => {
        // Mapeamento explícito para corrigir caracteres bugados nos cabeçalhos
        // e padronizar nomes para o frontend esperar.
        let cleanedHeader = header.trim();

        // Correções comuns de caracteres bugados e padronização
        // Estes nomes devem corresponder EXATAMENTE aos nomes esperados no frontend (App.js tableHeaders)
        if (cleanedHeader.includes('CHAMADO')) cleanedHeader = 'Chamado';
        else if (cleanedHeader.includes('NUMERO REFERENCIA') || cleanedHeader.includes('N?MERO REFERENCIA')) cleanedHeader = 'Numero Referencia';
        else if (cleanedHeader.includes('CONTRATANTE')) cleanedHeader = 'Contratante';
        else if (cleanedHeader.includes('SERVICO') || cleanedHeader.includes('SERVIÇO') || cleanedHeader.includes('SERVI?O')) cleanedHeader = 'Serviço';
        else if (cleanedHeader.includes('STATUS')) cleanedHeader = 'Status';
        else if (cleanedHeader.includes('DATA LIMITE')) cleanedHeader = 'Data Limite';
        else if (cleanedHeader.includes('CLIENTE')) cleanedHeader = 'Cliente';
        else if (cleanedHeader.includes('CNPJ / CPF') || cleanedHeader.includes('CNPJCPF') || cleanedHeader.includes('CNPJ-CPF')) cleanedHeader = 'CNPJ / CPF';
        else if (cleanedHeader.includes('CIDADE')) cleanedHeader = 'Cidade';
        else if (cleanedHeader.includes('TECNICO') || cleanedHeader.includes('TÉCNICO') || cleanedHeader.includes('T?CNICO')) cleanedHeader = 'Técnico';
        else if (cleanedHeader.includes('PRESTADOR')) cleanedHeader = 'Prestador';
        else if (cleanedHeader.includes('JUSTIFICATIVA DO ABONO') || cleanedHeader.includes('JUSTIFICATIVA DO ABONO')) cleanedHeader = 'Justificativa do Abono';
        // Adicione mais mapeamentos se houver outros cabeçalhos com problemas de acentuação ou grafia
        // Se o cabeçalho não for mapeado explicitamente, ele será mantido como está.
        return cleanedHeader;
      }
    }))
    .on('data', (data) => {
      const cleanedData = {};
      // Garante que todas as chaves esperadas existam, mesmo que vazias no CSV
      for (const header of expectedFrontendHeaders) {
        let value = data[header] !== undefined ? data[header] : ''; // Usa '' se a chave não existir
        if (typeof value === 'string') {
          value = value.trim();
          // Remove "="" e aspas de CNPJ/CPF se ainda vierem do CSV
          if (header === 'CNPJ / CPF' && value.startsWith('="') && value.endsWith('"')) {
            value = value.substring(2, value.length - 1);
          }
        }
        cleanedData[header] = value;
      }
      results.push(cleanedData);
    })
    .on('end', () => {
      // Garante que a resposta nunca seja um array vazio se houver um problema,
      // mas retorna os resultados se houver dados.
      if (results.length === 0) {
        // Se o CSV estava vazio ou não pôde ser parseado, retorna uma estrutura vazia
        // ou um erro mais específico, dependendo da necessidade.
        // Por enquanto, vamos retornar um array vazio, mas com um status 200.
        // O frontend deve lidar com um array vazio.
        return res.json([]);
      }
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
