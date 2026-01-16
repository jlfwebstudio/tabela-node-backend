const express = require('express');
const multer = require('multer');
const csvtojson = require('csvtojson');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// Configuração do CORS para permitir requisições do frontend
const allowedOrigins = [
    'http://localhost:3000', // Para desenvolvimento local do frontend
    process.env.FRONTEND_URL // A URL do seu frontend no Vercel (será definida no Render)
].filter(Boolean); // Remove entradas vazias se FRONTEND_URL não estiver definida

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem 'origin' (como de Postman ou curl)
        if (!origin) return callback(null, true);
        // Verifica se a origem da requisição está na lista de origens permitidas
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Configuração do Multer para lidar com o upload de arquivos
const storage = multer.memoryStorage(); // Armazena o arquivo na memória
const upload = multer({ storage: storage });

// Mapeamento de nomes de colunas do CSV para os nomes esperados no frontend
const columnMapping = {
    'Chamado': 'Chamado',
    'Numero Referencia': 'Numero Referencia',
    'Contratante': 'Contratante',
    'Serviço': 'Serviço',
    'Status': 'Status',
    'Data Limite': 'Data Limite',
    'Nome Cliente': 'Cliente',
    'CNPJ / CPF': 'CNPJ / CPF',
    'Cidade': 'Cidade',
    'Técnico': 'Técnico',
    'Prestador': 'Prestador',
    'Justificativa do Abono': 'Justificativa do Abono',
    // Adicionando mapeamentos para casos onde o nome do CSV pode ser diferente do que o frontend espera
    'Grupo Serviço': 'Serviço',
    'Prestador Responsável': 'Prestador',
    'Status Contratante': 'Status',
    'Nome Técnico': 'Técnico', // Adicionado para flexibilidade
    'Técnico Responsável': 'Técnico', // Adicionado para flexibilidade
    'Serviço': 'Serviço', // Adicionado para flexibilidade (Serviço com 'c' ou 'ç')
    'Tecnico': 'Técnico', // Adicionado para flexibilidade (Tecnico sem acento)
};

// Função para normalizar chaves de coluna para comparação (remove acentos, caracteres especiais, espaços extras, e converte para maiúsculas)
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
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        console.error('Erro: Nenhum arquivo enviado.');
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

        // --- NOVO LOG PARA DEPURAR jsonArray ---
        console.log('JSON Array gerado pelo csvtojson (primeiras 5 linhas):', jsonArray.slice(0, 5));
        console.log('Total de linhas no jsonArray:', jsonArray.length);
        // --- FIM NOVO LOG ---

        if (jsonArray.length === 0) {
            console.warn('csvtojson gerou um array vazio ou com apenas cabeçalhos. Verifique o formato do CSV ou se há dados válidos.');
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
                    // Tenta encontrar pelo nome exato com acento/sem acento, etc.
                    const possibleCsvKeys = Object.keys(row);
                    for (const csvKey of possibleCsvKeys) {
                        if (normalizeKeyForComparison(csvKey) === normalizeKeyForComparison(frontendHeader)) {
                            foundValue = row[csvKey];
                            break;
                        }
                    }
                }
                newRow[frontendHeader] = foundValue !== null ? foundValue : '';
            }

            // Lógicas de prioridade para colunas específicas com base nos logs e necessidades
            // Garante que os valores mais relevantes sejam usados
            // Exemplo: 'Serviço' pode vir como 'Serviço' ou 'Grupo Serviço'
            newRow['Serviço'] = row['Serviço'] || row['Grupo Serviço'] || '';
            newRow['Técnico'] = row['Técnico'] || row['Nome Técnico'] || row['Técnico Responsável'] || row['Tecnico'] || ''; // Adicionado 'Tecnico' sem acento
            newRow['Prestador'] = row['Prestador'] || row['Prestador Responsável'] || '';
            newRow['Status'] = row['Status'] || row['Status Contratante'] || '';
            newRow['Cliente'] = row['Cliente'] || row['Nome Cliente'] || '';
            newRow['Justificativa do Abono'] = row['Justificativa do Abono'] || '';
            newRow['Chamado'] = row['Chamado'] || '';
            newRow['Numero Referencia'] = row['Numero Referencia'] || '';
            newRow['Contratante'] = row['Contratante'] || '';
            newRow['Data Limite'] = row['Data Limite'] || '';
            newRow['CNPJ / CPF'] = row['CNPJ / CPF'] || '';
            newRow['Cidade'] = row['Cidade'] || '';


            return newRow;
        });

        // --- NOVO LOG PARA DEPURAR processedData ---
        console.log('Dados processados (primeiras 5 linhas):', processedData.slice(0, 5));
        console.log('Total de linhas nos dados processados:', processedData.length);
        // --- FIM NOVO LOG ---

        res.json(processedData);

    } catch (error) {
        console.error('Erro interno do servidor ao processar o arquivo CSV:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao processar o arquivo CSV.' });
    }
});

// Rota para verificar o status do servidor
app.get('/status', (req, res) => {
    res.status(200).json({ message: 'Backend is running!' });
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});
