// backend/server.js

const express = require('express');
const multer = require('multer');
const csvtojson = require('csvtojson');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3001; // Porta do backend

// Configuração do CORS para permitir requisições do frontend (localhost:3000)
app.use(cors({
  origin: 'http://localhost:3000', // Permite apenas o frontend
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Configuração do Multer para lidar com o upload de arquivos
const storage = multer.memoryStorage(); // Armazena o arquivo na memória
const upload = multer({ storage: storage });

// Mapeamento de nomes de colunas do CSV para os nomes esperados no frontend
// As chaves são os nomes EXATOS que aparecem no CSV (com acentos e caracteres especiais, conforme o log)
// Os valores são os nomes das colunas que o frontend espera
const columnMapping = {
  'Chamado': 'Chamado',
  'Numero Referencia': 'Numero Referencia',
  'Contratante': 'Contratante',
  'Servi�o': 'Serviço', // Usando o nome exato do log
  'Status': 'Status',
  'Data Limite': 'Data Limite',
  'Nome Cliente': 'Cliente',
  'CNPJ / CPF': 'CNPJ / CPF',
  'Cidade': 'Cidade',
  'T�cnico': 'Técnico', // Usando o nome exato do log
  'Prestador': 'Prestador',
  'Justificativa do Abono': 'Justificativa do Abono',
  // Adicionando mapeamentos para casos onde o nome do CSV pode ser diferente do que o frontend espera
  'Grupo Servi�o': 'Serviço', // Se 'Servi�o' não for encontrado, tenta 'Grupo Servi�o'
  'Prestador Respons�vel': 'Prestador', // Se 'Prestador' não for encontrado, tenta 'Prestador Respons�vel'
  'Status Contratante': 'Status', // Se 'Status' não for encontrado, tenta 'Status Contratante'
};

// Função para normalizar chaves de coluna para comparação (remove acentos, caracteres especiais, espaços extras, e converte para maiúsculas)
// Esta função é usada para comparar as chaves do CSV com as chaves do `columnMapping` de forma flexível.
const normalizeKeyForComparison = (key) => {
  if (typeof key !== 'string') return '';
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-zA-Z0-9 ]/g, '') // Remove caracteres não alfanuméricos (exceto espaços)
    .trim()
    .toUpperCase();
};

// Rota para upload de arquivo CSV
app.post('/upload', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  try {
    let jsonArray = [];
    let csvString = req.file.buffer.toString('utf8'); // Tenta UTF-8 primeiro
    console.log('--- INÍCIO DO PROCESSAMENTO DO CSV ---');
    console.log('Conteúdo bruto do CSV (UTF-8, primeiros 500 caracteres):', csvString.substring(0, 500) + '...');

    try {
      jsonArray = await csvtojson({
        delimiter: 'auto', // Detecta automaticamente o delimitador (vírgula, ponto e vírgula, etc.)
        trim: true, // Remove espaços em branco do início/fim dos valores
        checkType: false, // Não tenta converter tipos (mantém como string)
        noheader: false, // Assume que a primeira linha é o cabeçalho
        ignoreEmpty: true, // Ignora linhas vazias
        flatKeys: true, // Mantém as chaves simples, sem aninhamento
      }).fromString(csvString);
    } catch (utf8Error) {
      console.warn('Erro ao processar CSV com UTF-8, tentando latin1:', utf8Error.message);
      // Se UTF-8 falhar, tenta com latin1
      csvString = req.file.buffer.toString('latin1');
      console.log('Conteúdo bruto do CSV (latin1, primeiros 500 caracteres):', csvString.substring(0, 500) + '...');
      jsonArray = await csvtojson({
        delimiter: 'auto',
        trim: true,
        checkType: false,
        noheader: false,
        ignoreEmpty: true,
        flatKeys: true
      }).fromString(csvString);
    }

    console.log('JSON Array gerado pelo csvtojson (primeiras 3 linhas):', jsonArray.slice(0, 3));
    if (jsonArray.length === 0) {
      console.warn('csvtojson gerou um array vazio ou com apenas cabeçalhos.');
      return res.status(400).json({ error: 'O arquivo CSV foi processado, mas nenhum dado válido foi encontrado.' });
    }

    // Extrai os cabeçalhos originais do CSV para depuração
    const originalCsvHeaders = Object.keys(jsonArray[0] || {});
    console.log('Cabeçalhos originais detectados no CSV:', originalCsvHeaders);

    // Mapeamento e normalização de colunas para os nomes esperados no frontend
    const processedData = jsonArray.map(row => {
      const newRow = {};
      // Para cada cabeçalho que o frontend espera, tenta encontrar o valor correspondente no CSV
      for (const frontendHeader of Object.values(columnMapping)) {
        let foundValue = null;
        // Prioriza o mapeamento direto pelo nome exato
        if (row[frontendHeader] !== undefined) {
          foundValue = row[frontendHeader];
        } else {
          // Se não encontrou pelo nome exato, tenta encontrar por normalização e inclusão
          for (const csvKey in row) {
            if (normalizeKeyForComparison(csvKey).includes(normalizeKeyForComparison(frontendHeader))) {
              foundValue = row[csvKey];
              break;
            }
          }
        }
        newRow[frontendHeader] = foundValue !== null ? foundValue : '';
      }

      // Lógicas de prioridade para colunas específicas com base nos logs
      // Ex: 'Contratante' do CSV é 'GETNET', mas 'Status Contratante' é 'OS Encaminhada...'
      // Queremos 'Contratante' para a coluna 'Contratante' do frontend.
      if (row['Contratante'] !== undefined) {
        newRow['Contratante'] = row['Contratante'];
      }
      // Ex: 'Servi�o' do CSV é 'MANUTENCAO', 'Grupo Servi�o' é 'MANUTENCAO '
      // Queremos o valor de 'Servi�o' para a coluna 'Serviço' do frontend.
      if (row['Servi�o'] !== undefined) {
        newRow['Serviço'] = row['Servi�o'];
      } else if (row['Grupo Servi�o'] !== undefined) {
        newRow['Serviço'] = row['Grupo Servi�o'];
      }
      // Ex: 'T�cnico' do CSV é 'MARCELO OLIVEIRA DE MOURA'
      if (row['T�cnico'] !== undefined) {
        newRow['Técnico'] = row['T�cnico'];
      }
      // Ex: 'Prestador' do CSV é 'RS-SMART - SANTA CRUZ DO SUL', 'Prestador Respons�vel' é 'ADM - MOBYAN'
      // Queremos o valor de 'Prestador' para a coluna 'Prestador' do frontend.
      if (row['Prestador'] !== undefined) {
        newRow['Prestador'] = row['Prestador'];
      } else if (row['Prestador Respons�vel'] !== undefined) {
        newRow['Prestador'] = row['Prestador Respons�vel'];
      }
      // Ex: 'Nome Cliente' do CSV para 'Cliente' do frontend
      if (row['Nome Cliente'] !== undefined) {
        newRow['Cliente'] = row['Nome Cliente'];
      }
      // Ex: 'Status' do CSV para 'Status' do frontend
      if (row['Status'] !== undefined) {
        newRow['Status'] = row['Status'];
      }
      // Ex: 'Justificativa do Abono' do CSV para 'Justificativa do Abono' do frontend
      if (row['Justificativa do Abono'] !== undefined) {
        newRow['Justificativa do Abono'] = row['Justificativa do Abono'];
      }


      return newRow;
    });

    // Filtra para remover linhas que resultaram em objetos completamente vazios após o mapeamento
    const finalProcessedData = processedData.filter(row => Object.keys(row).length > 0);

    console.log('Dados processados com sucesso. Exemplo da primeira linha final:', finalProcessedData[0]);
    console.log('--- FIM DO PROCESSAMENTO DO CSV ---');
    res.json(finalProcessedData);

  } catch (error) {
    console.error('Erro geral ao processar o arquivo CSV no backend:', error);
    res.status(500).json({ error: `Erro ao processar o arquivo. Detalhes: ${error.message}. Verifique o formato e tente novamente.` });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
