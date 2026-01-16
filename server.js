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
// Adicionado mapeamentos mais robustos para lidar com caracteres especiais e variantes
const columnMapping = {
    'Chamado': 'Chamado',
    'Numero Referencia': 'Numero Referencia',
    'Contratante': 'Contratante',
    'Serviço': 'Serviço',
    'Status': 'Status',
    'Data Limite': 'Data Limite',
    'Cliente': 'Cliente',
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
    'Nome Cliente': 'Cliente', // Garante que 'Nome Cliente' seja mapeado para 'Cliente'
    'Cod. Cliente': 'Cod. Cliente', // Manter para possível uso futuro
    'Data Abertura': 'Data Abertura',
    'Data Atendimento': 'Data Atendimento',
    'Data Reg. Atendimento': 'Data Reg. Atendimento',
    'Data Check-In': 'Data Check-In',
    'Serial Instalado': 'Serial Instalado',
    'Tipo Equipamento Instalado': 'Tipo Equipamento Instalado',
    'Modelo Instalado': 'Modelo Instalado',
    'Serial Retirado': 'Serial Retirado',
    'Tipo Equipamento Retirado': 'Tipo Equipamento Retirado',
    'Modelo Retirado': 'Modelo Retirado',
    'Endereço': 'Endereço',
    'Bairro': 'Bairro',
    'Estado': 'Estado',
    'CEP': 'CEP',
    'ID Terminal': 'ID Terminal',
    'Observações Atendimento': 'Observações Atendimento',
    'Observações': 'Observações',
    'Descrição Motivo': 'Descrição Motivo',
    'Tipo Documento': 'Tipo Documento',
    'Baixa Tecnica': 'Baixa Tecnica',
    'Num Protocolo Técnico': 'Num Protocolo Técnico',
    'Dt Ger. do Prot. Técnico': 'Dt Ger. do Prot. Técnico',
    'Operadora': 'Operadora',
    '1a Op Indicada por GTR': '1a Op Indicada por GTR',
    '2a Op Indicada por GTR': '2a Op Indicada por GTR',
    'Tecnologia Contratante': 'Tecnologia Contratante',
    'Fotos': 'Fotos',
    'Visitas': 'Visitas',
    'Remarks': 'Remarks',
    'Latitude Abertura': 'Latitude Abertura',
    'Longitude Abertura': 'Longitude Abertura',
    'Latitude Atendimento': 'Latitude Atendimento',
    'Longitude Atendimento': 'Longitude Atendimento',
    'Distância Abertura/Fechamento': 'Distância Abertura/Fechamento',
    'Divergência de Chip Instalado': 'Divergência de Chip Instalado',
    'Status do Abono': 'Status do Abono',
    'Previsão': 'Previsão',
    'Observação do Abono': 'Observação do Abono',
    'Abonado Paytec': 'Abonado Paytec',
    'Abonado Contratante': 'Abonado Contratante',
    'Super Digital': 'Super Digital',
    'Super Cartão': 'Super Cartão',
    'Região': 'Região',
    'Ramo': 'Ramo',
    'Data Pré-Baixa': 'Data Pré-Baixa',
    'Tipo de Faturamento': 'Tipo de Faturamento',
    'Distancia Capital': 'Distancia Capital',
    'Centro Trabalho': 'Centro Trabalho',
    'Data Modificação': 'Data Modificação',
    'CPF Técnico': 'CPF Técnico',
    'Telefone 1': 'Telefone 1',
    'Telefone 2': 'Telefone 2',
    'Telefone 3': 'Telefone 3',
    'Telefone 4': 'Telefone 4',
    'Telefone 5': 'Telefone 5',
    'Qtd. KIT': 'Qtd. KIT',
    'Endereço OS - Receita': 'Endereço OS - Receita',
    'Baixa PDA': 'Baixa PDA',
    'Cabo Retirado': 'Cabo Retirado',
    'Bateria Retirada': 'Bateria Retirada',
    'Base Retirada': 'Base Retirada',
    'Fonte Retirada': 'Fonte Retirada',
    'Chip Retirado': 'Chip Retirado',
    'Cabo Instalado': 'Cabo Instalado',
    'Bateria Instalada': 'Bateria Instalada',
    'Base Instalada': 'Base Instalada',
    'Fonte Instalada': 'Fonte Instalada',
    'Chip Instalado': 'Chip Instalado',
    'FLAG_INSTALL_PELI': 'FLAG_INSTALL_PELI',
    'Tipo Atendimento': 'Tipo Atendimento',
    'Prestador Responsável': 'Prestador Responsável',
    'Distância EC': 'Distância EC',
    'Permissão Atender Fora do Perimetro': 'Permissão Atender Fora do Perimetro',
    'Versão Aplicativo': 'Versão Aplicativo',
    'Melhor Equipamento': 'Melhor Equipamento',
    'Hora Inicio Sabado': 'Hora Inicio Sabado',
    'Hora Termino Sabado': 'Hora Termino Sabado',
    'Protocolo': 'Protocolo',
    'Qtd. Protocolo': 'Qtd. Protocolo',
    'Ponto Referência': 'Ponto Referência',
    'Workday': 'Workday',
    'E-Mail': 'E-Mail',
    'Data Agendamento': 'Data Agendamento',
    'Motivo Retenção': 'Motivo Retenção',
    'Canal Credenciador EC': 'Canal Credenciador EC',
    'Canal de Entrada': 'Canal de Entrada',
    'Complemento': 'Complemento',
    'Data Retorno WhatsApp': 'Data Retorno WhatsApp',
    'Grau Parentesco': 'Grau Parentesco',
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

                // 1. Tenta encontrar pelo nome exato no CSV
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
