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
        let cleanedHeader = header.trim();

        // Normaliza para remover acentos e capitalizar para comparação robusta
        const normalizedForComparison = cleanedHeader.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        // Mapeamento explícito para corrigir caracteres bugados nos cabeçalhos
        // e padronizar nomes para o frontend esperar.
        // Estes nomes devem corresponder EXATAMENTE aos nomes esperados no frontend (App.js tableHeaders)
        if (normalizedForComparison.includes('CHAMADO')) return 'Chamado';
        else if (normalizedForComparison.includes('NUMERO REFERENCIA')) return 'Numero Referencia';
        else if (normalizedForComparison.includes('CONTRATANTE')) return 'Contratante';
        else if (normalizedForComparison.includes('SERVICO')) return 'Serviço';
        else if (normalizedForComparison.includes('STATUS')) return 'Status';
        else if (normalizedForComparison.includes('DATA LIMITE')) return 'Data Limite';
        else if (normalizedForComparison.includes('CLIENTE')) return 'Cliente';
        else if (normalizedForComparison.includes('CNPJ / CPF') || normalizedForComparison.includes('CNPJCPF')) return 'CNPJ / CPF';
        else if (normalizedForComparison.includes('CIDADE')) return 'Cidade';
        else if (normalizedForComparison.includes('TECNICO')) return 'Técnico';
        else if (normalizedForComparison.includes('PRESTADOR')) return 'Prestador';
        else if (normalizedForComparison.includes('JUSTIFICATIVA DO ABONO')) return 'Justificativa do Abono';

        // Se não houver mapeamento específico, retorna o cabeçalho limpo original
        return cleanedHeader;
      },
      mapValues: ({ header, value }) => {
        // Limpeza de valores específicos
        let cleanedValue = (value === undefined || value === null) ? '' : String(value).trim(); // Garante que valores vazios sejam strings vazias

        if (header === 'CNPJ / CPF') {
          // Remove o '=' inicial se presente, e aspas duplas
          cleanedValue = cleanedValue.replace(/^=/, '').replace(/"/g, '');
        }
        return cleanedValue;
      }
    }))
    .on('data', (data) => {
      // CORREÇÃO AQUI: Garante que todas as chaves esperadas existam no objeto de dados,
      // preenchendo com string vazia se a chave estiver faltando.
      const completeData = {};
    for (const header of expectedFrontendHeaders) {
      completeData[header] = data[header] !== undefined ? data[header] : '';
    }
    results.push(completeData);
    })
    .on('end', () => {
      console.log('CSV processado. Número de linhas:', results.length);
      if (results.length === 0) {
        return res.status(400).json({ error: 'Nenhum dado válido encontrado no CSV. Verifique o formato e o separador.' });
      }
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV. Verifique o formato.' });
    });
});

app.get('/', (req, res) => {
  res.send('Backend da Tabela React está funcionando!');
});

app.listen(port, () => {
  console.log(`Backend rodando na porta ${port}`);
});
