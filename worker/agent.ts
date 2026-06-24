import { gerarLinkReuniao, listarVideosNaPasta, downloadDriveFile, fazerUploadDrive } from './googleService';
import { gerarResumoMultimodal, gerarAudioResumo } from './aiService';
import { enviarNotificacaoAluno } from './evolutionService';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuração do cliente administrativo do Supabase (Bypassa RLS usando service_role)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabase.evaflow.com.br';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3ODk4ODQyMCwiZXhwIjo0OTM0NjYyMDIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.r4bNUUVIFZ5idLvyfRCODX2Rc0qN2LvKb6cfM7_1n0A';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Buffer de Segurança de 20 minutos (1.200.000 ms), agora configurável via variável de ambiente (fácil de reverter)
const BUFFER_CURA_TEMPO = process.env.BUFFER_CURA_TEMPO_MS ? parseInt(process.env.BUFFER_CURA_TEMPO_MS) : 20 * 60 * 1000;

// Mapa para gerenciar os timers ativos de cada pasta no Drive (Evita repetição e concorrência)
const timersDeProcessamento = new Map<string, NodeJS.Timeout>();
// Mapa para rastrear os arquivos de vídeo acumulados na janela de cura
const arquivosAcumulados = new Map<string, string[]>();

/**
 * Fluxo 1: Gatilho de Inicialização de Aula (Chamado síncronamente pela API/Express)
 * @param aulaId ID da aula a ser iniciada no Supabase
 * @returns O link da reunião Meet gerado
 */
export async function iniciarAula(aulaId: string): Promise<string> {
  console.log(`Iniciando fluxo de abertura para a aula ID: ${aulaId}...`);

  // 1. Busca os dados da aula no Supabase
  const { data: aula, error: fetchErr } = await supabase
    .from('aulas')
    .select('titulo')
    .eq('id', aulaId)
    .single();

  if (fetchErr || !aula) {
    throw new Error(`Erro ao buscar aula: ${fetchErr?.message || 'Aula não encontrada'}`);
  }

  // 2. Acessa o Google Calendar/Meet e gera o link
  const meetUrl = await gerarLinkReuniao(aula.titulo);

  // 3. Atualiza a tabela 'aulas' no Supabase
  const { error: updateErr } = await supabase
    .from('aulas')
    .update({
      meet_url: meetUrl,
      status: 'Em Aula', // Modificado de 'Gravando' para respeitar a constraint chk_aulas_status
      updated_at: new Date().toISOString()
    })
    .eq('id', aulaId);

  if (updateErr) {
    throw new Error(`Erro ao atualizar status da aula: ${updateErr.message}`);
  }

  console.log(`Aula ${aulaId} iniciada com sucesso. Link Meet: ${meetUrl}`);
  return meetUrl;
}

/**
 * Encerra a aula e dispara a esteira de monitoramento da gravação no Drive
 * @param aulaId ID da aula
 */
export async function encerrarAula(aulaId: string): Promise<void> {
  console.log(`[Express API] Encerrando aula ID: ${aulaId}...`);

  // 1. Busca os dados da aula (especialmente a pasta do Drive)
  const { data: aula, error: fetchErr } = await supabase
    .from('aulas')
    .select('id, folder_drive_id, status')
    .eq('id', aulaId)
    .single();

  if (fetchErr || !aula) {
    throw new Error(`Erro ao buscar aula: ${fetchErr?.message || 'Aula não encontrada'}`);
  }

  // 2. Atualiza o status da aula para "Processando IA" no Supabase
  const { error: updateErr } = await supabase
    .from('aulas')
    .update({
      status: 'Processando IA',
      updated_at: new Date().toISOString()
    })
    .eq('id', aulaId);

  if (updateErr) {
    throw new Error(`Erro ao atualizar status da aula para processamento: ${updateErr.message}`);
  }

  // 3. Dispara a esteira do monitoramento de arquivos no Drive para a pasta correspondente
  if (aula.folder_drive_id) {
    console.log(`[Encerrar] Acionando monitoramento de gravação na pasta: ${aula.folder_drive_id}`);
    // Não espera o buffer terminar (roda de forma assíncrona)
    monitorarNovaGravacao(aula.folder_drive_id).catch(err => {
      console.error(`Erro ao iniciar monitoramento do Drive para a pasta ${aula.folder_drive_id}:`, err.message);
    });
  } else {
    console.warn(`[Encerrar] A aula ${aulaId} não possui folder_drive_id configurado para buscar gravações.`);
  }
}

/**
 * Fluxo 2: Monitoramento da Pasta e Lógica do Buffer de Segurança (Cura de 20 min)
 * Este listener deve ser acionado por webhooks do Google Drive ou por uma tarefa cron.
 * 
 * @param folderDriveId ID da pasta correspondente à aula no Drive
 */
export async function monitorarNovaGravacao(folderDriveId: string) {
  console.log(`Novo arquivo detectado na pasta do Drive: ${folderDriveId}. Iniciando buffer de cura de ${BUFFER_CURA_TEMPO / 1000 / 60} minutos...`);

  // 1. Busca os vídeos atuais na pasta
  const videos = await listarVideosNaPasta(folderDriveId);
  if (videos.length === 0) return;

  const videoIds = videos.map(v => v.id);

  // 2. Se já existir um timer ativo para essa pasta, nós o cancelamos
  if (timersDeProcessamento.has(folderDriveId)) {
    console.log(`[Cura] Cancelando timer anterior para a pasta ${folderDriveId} para agrupar novas gravações.`);
    clearTimeout(timersDeProcessamento.get(folderDriveId)!);
    timersDeProcessamento.delete(folderDriveId);
  }

  // Acumula os IDs dos arquivos detectados
  arquivosAcumulados.set(folderDriveId, videoIds);

  // 3. Inicia um novo timer de 20 minutos
  const timer = setTimeout(async () => {
    timersDeProcessamento.delete(folderDriveId);
    const arquivosParaProcessar = arquivosAcumulados.get(folderDriveId) || [];
    arquivosAcumulados.delete(folderDriveId);

    console.log(`[Cura] Buffer de ${BUFFER_CURA_TEMPO / 1000 / 60} minutos concluído para a pasta ${folderDriveId}. Iniciando processamento de ${arquivosParaProcessar.length} vídeo(s)...`);
    
    // Dispara a esteira de processamento de IA
    await processarEsteiraIA(folderDriveId, arquivosParaProcessar);
  }, BUFFER_CURA_TEMPO);

  timersDeProcessamento.set(folderDriveId, timer);
}

/**
 * Fluxo 3: A Esteira de Processamento de IA
 * 
 * @param folderDriveId ID da pasta no Drive
 * @param videoIds Lista de IDs dos arquivos de vídeo no Drive
 */
async function processarEsteiraIA(folderDriveId: string, videoIds: string[]) {
  // Encontra a aula vinculada a esta pasta
  const { data: aula, error: fetchErr } = await supabase
    .from('aulas')
    .select('id, titulo, empresa_id')
    .eq('folder_drive_id', folderDriveId)
    .single();

  if (fetchErr || !aula) {
    console.error(`Erro ao localizar aula para a pasta ${folderDriveId}:`, fetchErr?.message);
    return;
  }

  // Atualiza status da aula para indicar processamento
  await supabase
    .from('aulas')
    .update({ status: 'Processando IA', updated_at: new Date().toISOString() })
    .eq('id', aula.id);

  const localFiles: string[] = [];

  try {
    // Baixa os vídeos do Drive localmente na VPS
    const tempDir = path.join(__dirname, '..', 'scratch', 'videos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    for (let i = 0; i < videoIds.length; i++) {
      const fileId = videoIds[i];
      const localPath = path.join(tempDir, `${aula.id}-video-${i}.mp4`);
      console.log(`Baixando vídeo ${fileId} para ${localPath}...`);
      const stream = await downloadDriveFile(fileId);
      const writeStream = fs.createWriteStream(localPath);
      stream.pipe(writeStream);
      
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      localFiles.push(localPath);
    }

    // Passo A: Transcrição e Sumarização Multimodal (Gemini 1.5 Flash)
    console.log('Iniciando Passo A: Gemini 1.5 Flash...');
    const resumoTexto = await gerarResumoMultimodal(localFiles);

    // Passo B: Geração do MP3 (OpenRouter - gpt-audio-mini)
    console.log('Iniciando Passo B: OpenRouter TTS...');
    const audioBuffer = await gerarAudioResumo(resumoTexto);

    // Passo C: Salvar o áudio no Supabase Storage e atualizar o banco
    console.log('Iniciando Passo C: Upload do áudio e persistência no banco...');
    const audioFilename = `${aula.empresa_id}/${aula.id}/resumo-${Date.now()}.mp3`;
    
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('audios_aulas')
      .upload(audioFilename, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadErr) {
      throw new Error(`Falha no upload do áudio para o Storage: ${uploadErr.message}`);
    }

    // Obtém a URL pública do áudio
    const { data: publicUrlData } = supabase.storage
      .from('audios_aulas')
      .getPublicUrl(audioFilename);

    const audioUrl = publicUrlData.publicUrl;

    // Passo D: Fazer upload do áudio e do resumo em texto diretamente para a pasta do Drive correspondente
    try {
      console.log(`[Drive Upload] Enviando áudio e resumo para a pasta do Drive: ${folderDriveId}...`);
      
      // Envia o resumo em formato de texto .txt
      const resumoBuffer = Buffer.from(resumoTexto, 'utf-8');
      await fazerUploadDrive(
        folderDriveId,
        `Resumo IA - ${aula.titulo}.txt`,
        'text/plain',
        resumoBuffer
      );

      // Envia o arquivo de áudio podcast .mp3
      await fazerUploadDrive(
        folderDriveId,
        `Podcast Resumo - ${aula.titulo}.mp3`,
        'audio/mpeg',
        audioBuffer
      );
      
      console.log('[Drive Upload] Arquivos salvos com sucesso na pasta do Drive.');
    } catch (driveErr: any) {
      console.error('Falha ao salvar arquivos gerados na pasta do Google Drive:', driveErr.message);
      // Mantém o fluxo rodando mesmo se falhar o backup do Drive
    }

    // Atualiza a tabela 'aulas' com o resumo e o áudio
    await supabase
      .from('aulas')
      .update({
        resumo_texto: resumoTexto,
        audio_url: audioUrl,
        status: 'Pronto para Envio',
        updated_at: new Date().toISOString()
      })
      .eq('id', aula.id);

    console.log(`[Esteira IA] Processamento concluído com sucesso para a aula "${aula.titulo}"!`);
    
    // Inicia a distribuição das notificações por WhatsApp para os alunos (Fluxo 4)
    await dispararNotificacoesWhatsApp(aula.id);

  } catch (error: any) {
    console.error(`Erro na esteira de IA da aula ${aula.id}:`, error.message);
    await supabase
      .from('aulas')
      .update({
        status: 'Erro de Processamento',
        updated_at: new Date().toISOString()
      })
      .eq('id', aula.id);
  } finally {
    // Limpa arquivos locais temporários
    for (const f of localFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
  }
}

/**
 * Fluxo 4: Distribuição por WhatsApp via Evolution API e Tratamento de Falhas
 * 
 * @param aulaId ID da aula
 */
export async function dispararNotificacoesWhatsApp(aulaId: string) {
  console.log(`Iniciando distribuição de mensagens WhatsApp para aula ID: ${aulaId}...`);

  // 1. Busca os detalhes da aula (resumo, áudio, PDF) e o tenant
  const { data: aula, error: fetchAulaErr } = await supabase
    .from('aulas')
    .select('id, titulo, resumo_texto, audio_url, pdf_url, empresa_id')
    .eq('id', aulaId)
    .single();

  if (fetchAulaErr || !aula) {
    console.error(`Erro ao buscar aula para disparos:`, fetchAulaErr?.message);
    return;
  }

  // 2. Busca os alunos ativos vinculados a este tenant/empresa_id (Multi-tenant RLS)
  // Caso a empresa_id seja 'tenant-matriz', trazemos também alunos com empresa_id nula ou vazia.
  let query = supabase.from('alunos').select('id, nome, telefone, empresa_id');
  
  if (aula.empresa_id === 'tenant-matriz') {
    query = query.or(`empresa_id.eq.tenant-matriz,empresa_id.is.null,empresa_id.eq.""`);
  } else {
    query = query.eq('empresa_id', aula.empresa_id);
  }

  const { data: alunos, error: fetchAlunosErr } = await query;

  if (fetchAlunosErr || !alunos || alunos.length === 0) {
    console.warn(`Nenhum aluno ativo encontrado para o tenant ${aula.empresa_id}. Finalizando fluxo.`);
    await supabase
      .from('aulas')
      .update({ status: 'Concluído', updated_at: new Date().toISOString() })
      .eq('id', aula.id);
    return;
  }

  console.log(`Encontrados ${alunos.length} alunos para receber notificações.`);

  let algumErro = false;

  for (const aluno of alunos) {
    try {
      // Dispara via Evolution API
      await enviarNotificacaoAluno(
        aluno.telefone,
        aula.resumo_texto || '',
        aula.audio_url || '',
        aula.pdf_url || undefined
      );

      // Registra sucesso nos logs de envio
      await supabase.from('logs_envio').insert({
        aula_id: aula.id,
        aluno_id: aluno.id,
        empresa_id: aula.empresa_id,
        status: 'Sucesso',
        detalhes: 'Enviado via Evolution API com sucesso.'
      });

    } catch (err: any) {
      algumErro = true;
      console.error(`Falha no envio para o aluno ${aluno.nome} (${aluno.telefone}):`, err.message);

      // Registra a falha de forma vital no banco de dados para auditoria do gestor
      await supabase.from('logs_envio').insert({
        aula_id: aula.id,
        aluno_id: aluno.id,
        empresa_id: aula.empresa_id,
        status: 'Falha',
        detalhes: `Erro no envio Evolution API: ${err.message}`
      });
    }
  }

  // 3. Atualiza o status final da aula
  if (algumErro) {
    await supabase
      .from('aulas')
      .update({
        status: 'Erro de Processamento', // Indica falha parcial ou total no envio (exibirá "Tentar Novamente" no dashboard)
        updated_at: new Date().toISOString()
      })
      .eq('id', aula.id);
  } else {
    await supabase
      .from('aulas')
      .update({
        status: 'Concluído',
        updated_at: new Date().toISOString()
      })
      .eq('id', aula.id);
  }

  console.log(`Disparos concluídos para aula ID ${aula.id}. Algum erro? ${algumErro}`);
}

/**
 * Função de retentativa manual (retryDisparo) exposta para o front-end (Fluxo 4 - Vital)
 * Permite ao coordenador forçar o reenvio a partir do painel de controle.
 * 
 * @param aulaId ID da aula
 */
export async function retryDisparo(aulaId: string): Promise<boolean> {
  console.log(`[Retry] Disparo manual acionado pelo dashboard para a aula ID: ${aulaId}...`);
  try {
    // Reprocessa os envios de WhatsApp
    await dispararNotificacoesWhatsApp(aulaId);
    return true;
  } catch (error: any) {
    console.error(`Erro ao executar retryDisparo para aula ${aulaId}:`, error.message);
    return false;
  }
}
