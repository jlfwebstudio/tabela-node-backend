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
        if (!origin) return callback(null, true);
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
// Prioriza os nomes exatos do frontend, mas também inclui variantes do CSV
const columnMapping = {
    'Chamado': 'Chamado',
    'Numero Referencia': 'Numero Referencia',
    'Contratante': 'Contratante',
    'Serviço': 'Serviço', // Nome esperado no frontend
    'Status': 'Status',
    'Data Limite': 'Data Limite',
    'Cliente': 'Cliente',
    'CNPJ / CPF': 'CNPJ / CPF',
    'Cidade': 'Cidade',
    'Técnico': 'Técnico', // Nome esperado no frontend
    'Prestador': 'Prestador',
    'Justificativa do Abono': 'Justificativa do Abono',
    // Mapeamentos adicionais para flexibilidade, incluindo os nomes com '�'
    'Grupo Serviço': 'Serviço',
    'Grupo Servico': 'Serviço',
    'Servico': 'Serviço',
    'Servi�o': 'Serviço', // Mapeamento direto para o nome com '�'
    'Técnico Responsável': 'Técnico',
    'Tecnico Responsavel': 'Técnico',
    'Nome Técnico': 'Técnico',
    'Nome Tecnico': 'Técnico',
    'Tecnico': 'Técnico',
    'T�cnico': 'Técnico', // Mapeamento direto para o nome com '�'
    'Status Contratante': 'Status',
    'Nome Cliente': 'Cliente',
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
            jsonArray = await csvtojson({
                delimiter: 'auto',
                trim: true,
                checkType: false,
                noheader: false,
                ignoreEmpty: true,
                flatKeys: true
            }).fromString(csvString);
        }

        if (jsonArray.length === 0) {
            console.warn('csvtojson gerou um array vazio ou com apenas cabeçalhos.');
            return res.status(400).json({ error: 'O arquivo CSV foi processado, mas nenhum dado válido foi encontrado.' });
        }

        const processedData = jsonArray.map(row => {
            const newRow = {};
            // Itera sobre os cabeçalhos que o frontend espera
            for (const frontendHeader of Object.values(columnMapping)) {
                let foundValue = null;

                // 1. Tenta encontrar pelo nome exato no CSV (incluindo os com '�')
                if (row[frontendHeader] !== undefined) {
                    foundValue = row[frontendHeader];
                } else {
                    // 2. Tenta encontrar usando o columnMapping para mapear nomes do CSV para nomes do frontend
                    for (const csvKey in columnMapping) {
                        if (columnMapping[csvKey] === frontendHeader && row[csvKey] !== undefined) {
                            foundValue = row[csvKey];
                            break;
                        }
                    }
                }

                // 3. Se ainda não encontrou, tenta encontrar por normalização e inclusão (mais flexível)
                if (foundValue === null || foundValue === undefined) {
                    const normalizedFrontendHeader = normalizeKeyForComparison(frontendHeader);
                    for (const csvKey in row) {
                        const normalizedCsvKey = normalizeKeyForComparison(csvKey);
                        if (normalizedCsvKey === normalizedFrontendHeader) { // Match exato normalizado
                            foundValue = row[csvKey];
                            break;
                        }
                        // Fallback para inclusão se o match exato normalizado falhar
                        if (normalizedCsvKey.includes(normalizedFrontendHeader) && normalizedFrontendHeader.length > 2) {
                            foundValue = row[csvKey];
                            break;
                        }
                    }
                }

                // Limpeza específica para CNPJ / CPF no backend
                if (frontendHeader === 'CNPJ / CPF' && typeof foundValue === 'string') {
                    foundValue = foundValue.replace(/^="|"$/g, ''); // Remove =" no início e " no final
                }

                newRow[frontendHeader] = foundValue !== null ? foundValue : ''; // Garante que a chave exista, mesmo que vazia
            }
            return newRow;
        });

        console.log(`Total de linhas nos dados processados: ${processedData.length}`);
        return res.json(processedData);

    } catch (error) {
        console.error('Erro no processamento do CSV:', error);
        return res.status(500).json({ error: 'Erro interno ao processar o arquivo CSV.', details: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Backend da Tabela está funcionando!');
});

app.listen(port, () => {
    console.log(`Servidor backend rodando na porta ${port}`);
});
