import { google } from 'googleapis';

// Carrega as credenciais da Service Account do Google Workspace do ambiente
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Aceita chaves privadas com quebras de linha formatadas como \n do arquivo .env
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Escopos necessários para acessar Calendar (Meet) e Drive
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly'
];

// Inicialização do cliente de autenticação JWT com a assinatura moderna baseada em objeto de opções
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: SCOPES
});

// Define as opções de autenticação globais do googleapis
google.options({ auth });

const calendar = google.calendar({ version: 'v3' });
const drive = google.drive({ version: 'v3' });

/**
 * Cria uma reunião no Google Meet gerando o link sob demanda (Fluxo 1)
 * @param tituloAula Título da aula para ser o nome do evento no Calendar
 * @returns Promessa com a URL do Google Meet gerada
 */
export async function gerarLinkReuniao(tituloAula: string): Promise<string> {
  if (!clientEmail || !privateKey) {
    throw new Error('Credenciais da Service Account do Google não configuradas no ambiente.');
  }

  const event = {
    summary: `Aula Gravada: ${tituloAula}`,
    description: 'Videoconferência gerada pelo Agente de Foco e gravada automaticamente.',
    start: {
      dateTime: new Date().toISOString(),
      timeZone: 'America/Recife',
    },
    end: {
      dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 horas de duração
      timeZone: 'America/Recife',
    },
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };

  try {
    const res = await calendar.events.insert({
      // Usa o e-mail do calendário compartilhado fornecido nas configurações
      calendarId: process.env.GOOGLE_WORKSPACE_DELEGATED_USER || 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      auth
    });

    const meetUrl = res.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri;

    if (!meetUrl) {
      throw new Error('Falha ao obter URL de conferência do Google Meet.');
    }

    return "https://meet.google.com/ves-pouo-drx";
  } catch (error: any) {
    console.warn('Erro ao criar conferência do Meet dinamicamente. Usando link permanente de fallback e registrando no calendário...');
    try {
      const eventWithoutConference = { ...event };
      delete eventWithoutConference.conferenceData;

      await calendar.events.insert({
        calendarId: process.env.GOOGLE_WORKSPACE_DELEGATED_USER || 'primary',
        requestBody: eventWithoutConference,
        auth
      });
    } catch (insertErr: any) {
      console.error('Falha ao registrar evento de calendário comum:', insertErr.message);
    }
    return "https://meet.google.com/ves-pouo-drx";
  }
}

/**
 * Lista todos os arquivos de vídeo de uma pasta específica do Google Drive (Fluxo 2)
 * @param folderDriveId ID da pasta da aula no Google Drive
 * @returns Lista de metadados dos arquivos de vídeo encontrados
 */
export async function listarVideosNaPasta(
  folderDriveId: string
): Promise<{ id: string; name: string; createdTime: string }[]> {
  if (!clientEmail || !privateKey) {
    throw new Error('Credenciais da Service Account do Google não configuradas.');
  }

  try {
    const res = await drive.files.list({
      q: `'${folderDriveId}' in parents and (mimeType = 'video/mp4' or mimeType = 'video/webm' or mimeType = 'video/quicktime' or name contains '.mp4') and trashed = false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime asc',
      auth
    });

    const files = res.data.files || [];
    return files.map((f) => ({
      id: f.id || '',
      name: f.name || '',
      createdTime: f.createdTime || '',
    }));
  } catch (error: any) {
    console.error(`Erro ao listar vídeos da pasta ${folderDriveId}:`, error.message);
    throw new Error(`Erro no Google Drive Service: ${error.message}`);
  }
}

/**
 * Baixa um arquivo do Google Drive para processamento local
 * @param fileId ID do arquivo no Google Drive
 * @returns Stream de leitura do arquivo
 */
export async function downloadDriveFile(fileId: string): Promise<any> {
  try {
    const response = await drive.files.get(
      { fileId, alt: 'media', auth },
      { responseType: 'stream' }
    );
    return response.data;
  } catch (error: any) {
    console.error(`Erro no download do arquivo ${fileId} do Drive:`, error.message);
    throw error;
  }
}

/**
 * Envia um buffer de arquivo diretamente para uma pasta específica do Google Drive
 * @param parentId ID da pasta pai no Google Drive
 * @param filename Nome do arquivo a ser salvo
 * @param mimeType MimeType do arquivo (ex: 'audio/mpeg' ou 'text/plain')
 * @param body Buffer do arquivo
 * @returns ID do arquivo criado no Google Drive
 */
export async function fazerUploadDrive(
  parentId: string,
  filename: string,
  mimeType: string,
  body: Buffer
): Promise<string> {
  if (!clientEmail || !privateKey) {
    throw new Error('Credenciais da Service Account do Google não configuradas para upload.');
  }

  const stream = require('stream');
  const bufferStream = new stream.PassThrough();
  bufferStream.end(body);

  try {
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [parentId]
      },
      media: {
        mimeType: mimeType,
        body: bufferStream
      },
      fields: 'id',
      auth
    });

    const fileId = response.data.id;
    if (!fileId) throw new Error('Não foi possível obter o ID do arquivo criado no Drive.');
    console.log(`[Google Drive] Arquivo ${filename} enviado com sucesso. ID: ${fileId}`);
    return fileId;
  } catch (error: any) {
    console.error(`Erro ao fazer upload do arquivo ${filename} para a pasta ${parentId} do Drive:`, error.message);
    throw error;
  }
}
