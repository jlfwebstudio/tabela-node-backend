// backend/server.js
const express = require('express');
const multer = require('multer');
const csvtojson = require('csvtojson');
const cors = require('cors');
const path = require('path');
const iconv = require('iconv-lite'); // Importa iconv-lite

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
// Adicionado mapeamentos mais robustos para lidar com caracteres especiais e variantes
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
    // Mapeamentos adicionais para flexibilidade e correção de caracteres
    'Grupo Serviço': 'Serviço',
    'Grupo Servico': 'Serviço', // Sem acento
    'Servico': 'Serviço', // Sem acento
    'Técnico Responsável': 'Técnico',
    'Tecnico Responsavel': 'Técnico', // Sem acento
    'Nome Técnico': 'Técnico',
    'Nome Tecnico': 'Técnico', // Sem acento
    'Tecnico': 'Técnico', // Sem acento
    'Prestador Responsável': 'Prestador',
    'Prestador Responsavel': 'Prestador', // Sem acento
    'Status Contratante': 'Status',
    'CPF Técnico': 'CPF Técnico', // Manter para possível uso futuro, mesmo que não na tabela principal
    'CPF Tecnico': 'CPF Técnico', // Sem acento
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
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        let jsonArray = [];
        let csvString;

        console.log('--- INÍCIO DO PROCESSAMENTO DO CSV ---');

        // Tenta decodificar com UTF-8, depois com ISO-8859-1 (latin1)
        try {
            csvString = iconv.decode(req.file.buffer, 'utf8');
            console.log('Conteúdo bruto do CSV (UTF-8, primeiros 500 caracteres):', csvString.substring(0, 500) + '...');
            jsonArray = await csvtojson({
                delimiter: 'auto',
                trim: true,
                checkType: false,
                noheader: false,
                ignoreEmpty: true,
                flatKeys: true,
            }).fromString(csvString);
        } catch (utf8Error) {
            console.warn('Erro ao processar CSV com UTF-8, tentando ISO-8859-1:', utf8Error.message);
            csvString = iconv.decode(req.file.buffer, 'ISO-8859-1'); // Tenta ISO-8859-1
            console.log('Conteúdo bruto do CSV (ISO-8859-1, primeiros 500 caracteres):', csvString.substring(0, 500) + '...');
            jsonArray = await csvtojson({
                delimiter: 'auto',
                trim: true,
                checkType: false,
                noheader: false,
                ignoreEmpty: true,
                flatKeys: true
            }).fromString(csvString);
        }

        console.log('JSON Array gerado pelo csvtojson (primeiras 5 linhas):', jsonArray.slice(0, 5));
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
                let originalCsvKey = null;

                // 1. Tenta encontrar pelo nome exato (já normalizado ou não)
                if (row[frontendHeader] !== undefined) {
                    foundValue = row[frontendHeader];
                    originalCsvKey = frontendHeader;
                } else {
                    // 2. Tenta encontrar pelo mapeamento direto do columnMapping
                    for (const csvKey in columnMapping) {
                        if (columnMapping[csvKey] === frontendHeader && row[csvKey] !== undefined) {
                            foundValue = row[csvKey];
                            originalCsvKey = csvKey;
                            break;
                        }
                    }
                }

                // 3. Se ainda não encontrou, tenta encontrar por normalização e inclusão (mais flexível)
                if (foundValue === null) {
                    const normalizedFrontendHeader = normalizeKeyForComparison(frontendHeader);
                    for (const csvKey in row) {
                        if (normalizeKeyForComparison(csvKey).includes(normalizedFrontendHeader) ||
                            normalizedFrontendHeader.includes(normalizeKeyForComparison(csvKey))) {
                            foundValue = row[csvKey];
                            originalCsvKey = csvKey;
                            break;
                        }
                    }
                }

                // Limpeza específica para CNPJ / CPF
                if (frontendHeader === 'CNPJ / CPF' && typeof foundValue === 'string') {
                    foundValue = foundValue.replace(/^="|"$/g, ''); // Remove =" no início e " no final
                }

                newRow[frontendHeader] = foundValue !== null ? foundValue : ''; // Garante que a chave exista, mesmo que vazia
            }
            return newRow;
        });

        console.log('Dados processados (primeiras 5 linhas):', processedData.slice(0, 5));
        console.log('Total de linhas nos dados processados:', processedData.length);

        res.json(processedData);

    } catch (error) {
        console.error('Erro ao processar o arquivo CSV:', error);
        res.status(500).json({ error: 'Erro interno ao processar o arquivo CSV.', details: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Backend da Tabela está funcionando!');
});

app.listen(port, () => {
    console.log(`Servidor backend rodando na porta ${port}`);
});
