const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL; // Ex: https://api.evolution.com.br
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME; // Ex: Quimica1000

/**
 * Dispara uma notificação para o aluno via WhatsApp com o resumo em áudio, resumo em texto e PDF de apoio.
 * 
 * @param phone Número do telefone do aluno no formato internacional (DDI + DDD + Numero)
 * @param text Resumo em texto gerado pelo Gemini
 * @param audioUrl URL pública do áudio/podcast sintetizado pelo OpenRouter
 * @param pdfUrl URL pública do PDF de apoio da aula
 * @returns Promessa booleana indicando sucesso no disparo
 */
export async function enviarNotificacaoAluno(
  phone: string,
  text: string,
  audioUrl: string,
  pdfUrl?: string
): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    throw new Error('Configurações da Evolution API incompletas no ambiente.');
  }

  // 1. Enviar mensagem de texto (Resumo da Aula)
  const messageBody = {
    number: phone,
    options: {
      delay: 1200,
      presence: "composing"
    },
    textMessage: {
      text: `*📚 Química 1000 - Resumo de Aula de Química*\n\nOlá! Segue o resumo dos tópicos abordados hoje pelo professor:\n\n${text}\n\n👇 Ouça o áudio podcast explicativo e baixe o material PDF abaixo.`
    }
  };

  try {
    console.log(`Enviando mensagem de texto para ${phone}...`);
    const textRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageBody)
    });

    if (!textRes.ok) {
      throw new Error(`Falha no envio do texto Evolution API: ${await textRes.text()}`);
    }

    // 2. Enviar arquivo de áudio
    console.log(`Enviando áudio resumo para ${phone}...`);
    const audioBody = {
      number: phone,
      options: {
        delay: 1000,
        presence: "recording"
      },
      mediaMessage: {
        mediatype: "audio",
        media: audioUrl,
        caption: "Resumo da Aula em Áudio"
      }
    };

    const audioRes = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(audioBody)
    });

    if (!audioRes.ok) {
      console.warn(`Erro não-crítico ao enviar áudio Evolution API: ${await audioRes.text()}`);
    }

    // 3. Enviar PDF de apoio se existir
    if (pdfUrl) {
      console.log(`Enviando PDF de apoio para ${phone}...`);
      const documentBody = {
        number: phone,
        options: {
          delay: 1000
        },
        mediaMessage: {
          mediatype: "document",
          media: pdfUrl,
          fileName: "Material_Complementar.pdf",
          caption: "Material de Apoio e Exercícios"
        }
      };

      const docRes = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(documentBody)
      });

      if (!docRes.ok) {
        console.warn(`Erro não-crítico ao enviar PDF Evolution API: ${await docRes.text()}`);
      }
    }

    return true;
  } catch (error: any) {
    console.error(`Erro ao enviar mensagens via Evolution API para ${phone}:`, error.message);
    // Dispara erro para ser capturado pela lógica de retentativa e logs_envio
    throw error;
  }
}
