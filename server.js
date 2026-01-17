// backend/server.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const stream = require('stream');
const iconv = require('iconv-lite');

const app = express();
// CORREÇÃO: Usar process.env.PORT fornecido pelo ambiente (Render) ou 3001 como fallback local
const PORT_TO_USE = process.env.PORT || 3001;

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
  const decodedStream = bufferStream.pipe(iconv.decodeStream('latin1')).pipe(iconv.encodeStream('utf8'));

  decodedStream
    .pipe(csv({
      separator: ';', // Prioriza o ponto e vírgula como separador principal
      mapHeaders: ({ header }) => {
        let cleanedHeader = header.trim();

        // Mapeamento explícito para corrigir caracteres bugados nos cabeçalhos
        // e padronizar nomes para o frontend esperar.
        if (cleanedHeader.includes('CHAMADO')) cleanedHeader = 'Chamado';
        else if (cleanedHeader.includes('NUMERO REFERENCIA') || cleanedHeader.includes('N?MERO REFERENCIA')) cleanedHeader = 'Numero Referencia';
        else if (cleanedHeader.includes('CONTRATANTE')) cleanedHeader = 'Contratante';
        else if (cleanedHeader.includes('SERVICO') || cleanedHeader.includes('SERVIÇO') || cleanedHeader.includes('SERVI?O')) cleanedHeader = 'Serviço';
        else if (cleanedHeader.includes('STATUS')) cleanedHeader = 'Status';
        else if (cleanedHeader.includes('DATA LIMITE')) cleanedHeader = 'Data Limite';
        // CORREÇÃO AQUI: Mapeamento mais robusto para 'Cliente'
        else if (cleanedHeader.includes('CLIENTE') || cleanedHeader.includes('NOME CLIENTE') || cleanedHeader.includes('NOME_CLIENTE')) cleanedHeader = 'Cliente';
        else if (cleanedHeader.includes('CNPJ / CPF') || cleanedHeader.includes('CNPJCPF') || cleanedHeader.includes('CNPJ-CPF')) cleanedHeader = 'CNPJ / CPF';
        else if (cleanedHeader.includes('CIDADE')) cleanedHeader = 'Cidade';
        // CORREÇÃO AQUI: Mapeamento mais robusto para 'Técnico'
        else if (cleanedHeader.includes('TECNICO') || cleanedHeader.includes('TÉCNICO') || cleanedHeader.includes('TECNICO')) cleanedHeader = 'Técnico';
        else if (cleanedHeader.includes('PRESTADOR')) cleanedHeader = 'Prestador';
        else if (cleanedHeader.includes('JUSTIFICATIVA DO ABONO') || cleanedHeader.includes('JUSTIFICATIVA ABONO')) cleanedHeader = 'Justificativa do Abono';
        // Se o cabeçalho não for mapeado explicitamente, tenta usá-lo como está
        return cleanedHeader;
      }
    }))
    .on('data', (data) => {
      // Pós-processamento para garantir que todas as chaves esperadas existam
      // e limpar dados, como CNPJ/CPF
      const processedRow = {};
      expectedFrontendHeaders.forEach(header => {
        let value = data[header] !== undefined ? String(data[header]).trim() : '';

        // Limpeza específica para CNPJ / CPF
        if (header === 'CNPJ / CPF' && value) {
          value = value.replace(/[^\d]/g, ''); // Remove tudo que não for dígito
        }
        processedRow[header] = value;
      });
      results.push(processedRow);
    })
    .on('end', () => {
      if (results.length === 0) {
        // Retorna uma mensagem clara se o CSV estiver vazio ou não puder ser processado
        return res.status(200).json({ message: 'Arquivo CSV processado, mas nenhum dado válido encontrado.', data: [] });
      }
      res.json(results);
    })
    .on('error', (error) => {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({ error: 'Erro ao processar o arquivo CSV.', details: error.message });
    });
});

app.get('/', (req, res) => {
  res.send('Backend da Tabela está online!');
});

app.listen(PORT_TO_USE, () => {
  console.log(`Servidor backend escutando na porta ${PORT_TO_USE}`);
  console.log(`CORS permitido para: ${frontendUrl}`);
});
