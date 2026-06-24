import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { iniciarAula, retryDisparo, monitorarNovaGravacao } from './worker/agent';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabase.evaflow.com.br';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos (index.html e assets) na raiz do servidor
app.use(express.static('.'));

// Endpoint para iniciar aula (Fluxo síncrono que gera o Meet e atualiza o Supabase)
app.post('/api/aula/iniciar', async (req, res) => {
  const { aulaId } = req.body;
  if (!aulaId) {
    return res.status(400).json({ error: 'aulaId é obrigatório' });
  }

  try {
    const meetUrl = await iniciarAula(aulaId);
    return res.json({ success: true, meetUrl });
  } catch (error: any) {
    console.error('Erro no endpoint iniciar aula:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint para reenviar materiais e notificações do WhatsApp
app.post('/api/aula/retry', async (req, res) => {
  const { aulaId } = req.body;
  if (!aulaId) {
    return res.status(400).json({ error: 'aulaId é obrigatório' });
  }

  try {
    const success = await retryDisparo(aulaId);
    return res.json({ success });
  } catch (error: any) {
    console.error('Erro no endpoint retry:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint webhook para receber alterações de arquivos do Google Drive (ou simulados para testes)
app.post('/api/webhook/drive', async (req, res) => {
  const { folderDriveId } = req.body;
  if (!folderDriveId) {
    return res.status(400).json({ error: 'folderDriveId é obrigatório' });
  }

  try {
    // Aciona a esteira do Worker de cura e processamento
    monitorarNovaGravacao(folderDriveId);
    return res.json({ success: true, message: 'Monitoramento iniciado para a pasta.' });
  } catch (error: any) {
    console.error('Erro no webhook drive:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar as aulas reais do Supabase
app.get('/api/aulas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aulas')
      .select('*')
      .order('data_prevista', { ascending: true });

    if (error) throw error;
    return res.json(data);
  } catch (error: any) {
    console.error('Erro ao listar aulas:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando e servindo a aplicação na porta ${port}`);
});
