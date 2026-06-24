'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Copy, 
  Check, 
  RefreshCw, 
  Volume2, 
  FileText, 
  Sparkles,
  Layers, 
  Calendar, 
  ExternalLink,
  Search,
  MessageSquare,
  AlertTriangle,
  Folder,
  ArrowRight,
  User,
  Database
} from 'lucide-react';

// 1. DADOS DE MOCK DAS 12 AULAS DE QUÍMICA 1000
interface Aula {
  id: string;
  titulo: string;
  data_prevista: string;
  folder_drive_id: string;
  status: 'Aguardando' | 'Gravando' | 'Processando IA' | 'Pronto para Envio' | 'Erro de Processamento' | 'Concluído';
  meet_url?: string;
  resumo_texto?: string;
  audio_url?: string;
  empresa_id: string;
}

const AULAS_INICIAIS: Aula[] = [
  { id: '1', titulo: 'ELTROQUIMICA - PILHA E ELETROLESE', data_prevista: '16/08/2026', folder_drive_id: '1jTIZ9wdqsdMYcOaiMUflWyz4LuE67gD9', status: 'Aguardando', empresa_id: 'tenant-matriz' },
  { id: '2', titulo: 'TERMOQUIMICA / CINETICA QUIMICA', data_prevista: '23/08/2026', folder_drive_id: '1_TN-fRBEUsblDIkMAFmWfZqgeE5QjZuc', status: 'Concluído', empresa_id: 'tenant-matriz', meet_url: 'https://meet.google.com/abc-defg-hij', resumo_texto: 'A aula abordou calorimetria, entalpia (H), equações termoquímicas e fatores que afetam a velocidade das reações químicas (concentração, temperatura, catalisadores). O foco principal foi a análise dos gráficos de energia.', audio_url: 'https://example.com/audio2.mp3' },
  { id: '3', titulo: 'EQUILIBRIO QUIMICO / FUNÇÕES INORGÊNICAS', data_prevista: '30/08/2026', folder_drive_id: '1nEUb-F5vCiCmC1Rm_6IwEEugwZZC-JZj', status: 'Aguardando', empresa_id: 'tenant-matriz' },
  { id: '4', titulo: 'EQUILIBRIO IONICO', data_prevista: '06/09/2026', folder_drive_id: '1dRP_zGdF5C9VpxIZOUpvjLb4fPO-4hqn', status: 'Aguardando', empresa_id: 'tenant-matriz' },
  { id: '5', titulo: 'ESTEQUIOMETRIA', data_prevista: '13/09/2026', folder_drive_id: '12UKbhDZvJncL5YF3LQozHTwFTwoj_Ce3', status: 'Erro de Processamento', empresa_id: 'tenant-matriz' },
  { id: '6', titulo: 'RADIOATIVIDADE / MODELOS ATOMICOS', data_prevista: '20/09/2026', folder_drive_id: '1n12rehvDRVetQ3JZPOLg8bI1ohleFOVO', status: 'Aguardando', empresa_id: 'tenant-filial1' },
  { id: '7', titulo: 'FUNCOES ORGANICAS', data_prevista: '27/09/2026', folder_drive_id: '1dTMQWtkeJEuMSWB0ojWLJE_PcqzzsNOC', status: 'Aguardando', empresa_id: 'tenant-filial1' },
  { id: '8', titulo: 'PROPRIEDADES DOS COMPOSTOS ORGANICOS', data_prevista: '04/10/2026', folder_drive_id: '1XEXxPMG_99VURltdx7h9xbBycCsKAPnw', status: 'Aguardando', empresa_id: 'tenant-filial1' },
  { id: '9', titulo: 'ISOMERIA', data_prevista: '11/10/2026', folder_drive_id: '1zn3RfXnFHbGpBVv-NN4lkJy9myOqTtn8', status: 'Aguardando', empresa_id: 'tenant-online' },
  { id: '10', titulo: 'REACOES ORGANICAS', data_prevista: '18/10/2026', folder_drive_id: '1T_I-CQvIEtmxcgKu4svpeHJMb9DvS8Av', status: 'Aguardando', empresa_id: 'tenant-online' },
  { id: '11', titulo: 'TABELA PERIODICA/ LIGACOES QUIMICAS', data_prevista: '25/10/2026', folder_drive_id: '1Go3pQeXz93sy5AVhngDaryMyaAQMM3nn', status: 'Aguardando', empresa_id: 'tenant-online' },
  { id: '12', titulo: 'METODOS DE SEPARACAO E QUIMICA AMBIENTAL', data_prevista: '01/11/2026', folder_drive_id: '1iEeVHwJPAh3RUC8u7QOwm--uKK4iPoLX', status: 'Aguardando', empresa_id: 'tenant-online' }
];

const TENANTS = [
  { id: 'tenant-matriz', nome: 'Força Isoladas - Matriz Recife' },
  { id: 'tenant-filial1', nome: 'Força Isoladas - Caruaru' },
  { id: 'tenant-online', nome: 'Força Isoladas - EAD' }
];

// Componente simples de Toast Customizado para notificar ações
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function AgenteFocoMVP() {
  const [aulas, setAulas] = useState<Aula[]>(AULAS_INICIAIS);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('tenant-matriz');
  
  // Estado da Aula Ativa do Professor
  const [selectedAulaId, setSelectedAulaId] = useState<string>('1');
  const [loadingIniciar, setLoadingIniciar] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [meetUrl, setMeetUrl] = useState<string>('');
  const [copiando, setCopiando] = useState(false);
  
  // Controle de Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modais de Simulação no Dashboard
  const [activeResumo, setActiveResumo] = useState<{titulo: string, texto: string} | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);

  // Filtro de aulas baseado no Tenant selecionado (Multi-tenancy RLS)
  const aulasFiltradas = aulas.filter(a => a.empresa_id === selectedTenantId);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // 1. Iniciar Aula e Gravação
  const handleIniciarAula = () => {
    if (isRecording) return;
    
    setLoadingIniciar(true);
    // Simula tempo de requisição de criação da sala no Google Meet
    setTimeout(() => {
      setLoadingIniciar(false);
      setIsRecording(true);
      
      // Gera um link simulado baseado na aula
      const randStr = Math.random().toString(36).substring(2, 5) + '-' + 
                      Math.random().toString(36).substring(2, 6) + '-' + 
                      Math.random().toString(36).substring(2, 5);
      const generatedUrl = `https://meet.google.com/${randStr}`;
      setMeetUrl(generatedUrl);

      // Atualiza o estado da aula no Supabase/Estado Local
      setAulas(prev => prev.map(a => {
        if (a.id === selectedAulaId) {
          return { ...a, status: 'Gravando', meet_url: generatedUrl };
        }
        return a;
      }));

      showToast("Aula e gravação iniciadas com sucesso!", "success");
    }, 1500);
  };

  // 2. Copiar Link do Meet
  const handleCopyLink = () => {
    if (!meetUrl) return;
    setCopiando(true);
    navigator.clipboard.writeText(meetUrl).then(() => {
      showToast("Link do Google Meet copiado para a área de transferência!", "success");
      setTimeout(() => setCopiando(false), 2000);
    }).catch(() => {
      showToast("Erro ao copiar link.", "error");
      setCopiando(false);
    });
  };

  // 3. Encerrar Aula
  const handleEncerrarAula = () => {
    if (!isRecording) return;
    
    const aulaIdParaEncerrar = selectedAulaId;
    
    setIsRecording(false);
    setMeetUrl('');
    
    // Atualiza para Processando IA
    setAulas(prev => prev.map(a => {
      if (a.id === aulaIdParaEncerrar) {
        return { ...a, status: 'Processando IA' };
      }
      return a;
    }));

    showToast("Aula encerrada! O processamento da IA (resumo e áudio) foi iniciado no background.", "info");

    // Simulação do término do processamento da IA em background após 10 segundos
    setTimeout(() => {
      setAulas(prev => prev.map(a => {
        if (a.id === aulaIdParaEncerrar) {
          return { 
            ...a, 
            status: 'Concluído',
            resumo_texto: `Resumo gerado por IA para a aula: ${a.titulo}. Os principais pontos discutidos envolveram a introdução histórica ao assunto, conceitos práticos e aplicações no ENEM. Recomenda-se focar nos exercícios de fixação da seção 2 do material complementar.`,
            audio_url: 'https://example.com/audio-podcast.mp3'
          };
        }
        return a;
      }));
      showToast(`Processamento da IA concluído para a aula de ${aulas.find(a => a.id === aulaIdParaEncerrar)?.titulo || ''}!`, "success");
    }, 10000);
  };

  // 4. Retentativa de Whatsapp / Erro
  const handleRetryWhatsapp = (id: string) => {
    // Coloca em loading rápido e atualiza status
    setAulas(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'Processando IA' };
      }
      return a;
    }));
    showToast("Reenviando materiais e notificações de WhatsApp...", "info");

    setTimeout(() => {
      setAulas(prev => prev.map(a => {
        if (a.id === id) {
          return { 
            ...a, 
            status: 'Concluído',
            resumo_texto: `Resumo reprocessado com sucesso para a aula: ${a.titulo}.`,
            audio_url: 'https://example.com/audio-retry.mp3'
          };
        }
        return a;
      }));
      showToast("Notificações enviadas aos alunos via WhatsApp!", "success");
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#090a0a] text-white font-sans antialiased selection:bg-[#f26522]/30 selection:text-white pb-16">
      {/* HEADER PRINCIPAL (Estilo Química 1000 / Força Isoladas) */}
      <header className="sticky top-0 z-50 bg-[#f26522] border-b border-[#ffffff]/10 shadow-lg transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {/* Logo Química 1000 Mock */}
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-wider text-white font-heading">
                QUÍMICA <span className="text-[#090a0a]">1000</span>
              </span>
              <span className="bg-[#090a0a] text-white text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                <Sparkles className="w-2.5 h-2.5 text-[#f26522] animate-pulse" /> Agente de Foco MVP
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Seletor Multi-tenant Simulado (RLS Bypass) */}
            <div className="flex items-center gap-2 bg-[#090a0a]/30 border border-white/10 px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-[#090a0a]/40">
              <Database className="w-4 h-4 text-white/70" />
              <select 
                value={selectedTenantId} 
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  showToast(`RLS ativo: Filtrado para a empresa selecionada.`, "info");
                }}
                className="bg-transparent border-none text-white focus:outline-none text-xs font-semibold cursor-pointer max-w-[200px]"
              >
                {TENANTS.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#090a0a] text-white">
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 border-l border-white/20 pl-4">
              <div className="w-8 h-8 rounded-full bg-[#090a0a]/20 border border-white/15 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-bold hidden sm:inline-block">Professor Química</span>
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO DA PÁGINA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LADO ESQUERDO: INTERFACE DO PROFESSOR (4 Colunas) */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-[#121314] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
            {/* Laranja / Vermelho Gradient de fundo para dar sofisticação visual */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#f26522]/15 to-[#e11d48]/10 rounded-full blur-3xl pointer-events-none" />
            
            <h2 className="text-xl font-bold font-heading mb-6 flex items-center gap-2 text-white border-b border-white/5 pb-4">
              <Play className="w-5 h-5 text-[#f26522]" /> Operação de Aula
            </h2>

            {/* SELEÇÃO DE AULA DROPDOWN */}
            <div className="space-y-2 mb-6">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                Selecione a Aula do Cronograma
              </label>
              <div className="relative">
                <select
                  value={selectedAulaId}
                  onChange={(e) => setSelectedAulaId(e.target.value)}
                  disabled={isRecording}
                  className="w-full bg-[#1c1d1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f26522] focus:border-transparent transition duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {aulasFiltradas.map(aula => (
                    <option key={aula.id} value={aula.id} className="bg-[#121314] text-white">
                      {aula.data_prevista} - {aula.titulo}
                    </option>
                  ))}
                </select>
                {isRecording && (
                  <p className="text-[11px] text-[#e11d48] mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Encerre a aula ativa para alterar a seleção.
                  </p>
                )}
              </div>
            </div>

            {/* BOTÃO DE AÇÃO PRINCIPAL */}
            <div className="space-y-4">
              {!isRecording ? (
                <button
                  onClick={handleIniciarAula}
                  disabled={loadingIniciar}
                  className="w-full bg-[#f26522] hover:bg-[#d84a0d] active:scale-[0.98] text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-[#f26522]/20 hover:shadow-[#f26522]/30 flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-85"
                >
                  {loadingIniciar ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Iniciando Aula e Meet...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>Iniciar Aula e Gravação</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Status Visual "Gravando" com Pulso Animado */}
                  <div className="flex items-center justify-between bg-[#e11d48]/10 border border-[#e11d48]/20 px-4 py-3 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#e11d48]"></span>
                      </span>
                      <span className="text-sm font-bold text-[#e11d48] uppercase tracking-wider animate-pulse">
                        GRAVANDO AULA...
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono bg-[#1c1d1e] px-2 py-1 rounded">
                      Ao Vivo
                    </span>
                  </div>

                  {/* Lógica do Google Meet link */}
                  {meetUrl && (
                    <div className="bg-[#1c1d1e] border border-white/5 p-4 rounded-xl space-y-3">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                        Link da Reunião
                      </span>
                      <div className="flex items-center justify-between gap-2 bg-[#090a0a] px-3 py-2.5 rounded-lg border border-white/5">
                        <a 
                          href={meetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-[#f26522] hover:underline truncate max-w-[200px] flex items-center gap-1 font-mono"
                        >
                          {meetUrl} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                        <button
                          onClick={handleCopyLink}
                          className="bg-[#1c1d1e] hover:bg-white/10 text-white p-2 rounded-md transition duration-200 flex items-center justify-center gap-1 text-[11px] font-bold"
                          title="Copiar Link"
                        >
                          {copiando ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          <span>Copiar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* BOTÃO DE ENCERRAMENTO */}
                  <button
                    onClick={handleEncerrarAula}
                    className="w-full bg-white/5 border border-white/15 hover:bg-[#e11d48] hover:border-transparent text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 active:scale-[0.98]"
                  >
                    <Square className="w-5 h-5 fill-current" />
                    <span>Encerrar Aula</span>
                  </button>
                </div>
              )}
            </div>

            {/* Caixa Informativa do Google Drive */}
            <div className="mt-8 pt-6 border-t border-white/5 flex gap-3 text-xs text-gray-400 leading-relaxed">
              <Folder className="w-5 h-5 text-[#f26522] flex-shrink-0" />
              <div>
                <p className="font-bold text-gray-300 mb-1">Integração Google Drive</p>
                <p>
                  As gravações de áudio e materiais de apoio criados durante a aula serão arquivados diretamente na pasta sincronizada do Drive desta aula.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* LADO DIREITO: PAINEL DE GESTÃO - DASHBOARD (7 Colunas) */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-[#121314] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold font-heading flex items-center gap-2 text-white">
                <Layers className="w-5 h-5 text-[#f26522]" /> Painel de Acompanhamento
              </h2>
              <div className="text-xs text-gray-400">
                Mostrando aulas da unidade ativa
              </div>
            </div>

            {/* TABELA DE ACOMPANHAMENTO */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pr-2">Aula / Título</th>
                    <th className="pb-3 px-2 text-center">Data</th>
                    <th className="pb-3 px-2 text-center">Status</th>
                    <th className="pb-3 pl-2 text-right">Ações IA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {aulasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-500">
                        Nenhuma aula encontrada para esta empresa/tenant.
                      </td>
                    </tr>
                  ) : (
                    aulasFiltradas.map(aula => (
                      <tr key={aula.id} className="hover:bg-white/[0.02] transition duration-150">
                        {/* Título & Drive */}
                        <td className="py-4 pr-2 max-w-[220px]">
                          <p className="font-bold text-white truncate" title={aula.titulo}>
                            {aula.titulo}
                          </p>
                          <span className="text-[10px] text-gray-500 font-mono block mt-0.5 truncate">
                            ID Drive: {aula.folder_drive_id}
                          </span>
                        </td>
                        
                        {/* Data */}
                        <td className="py-4 px-2 text-center text-gray-300 font-medium text-xs font-mono">
                          {aula.data_prevista}
                        </td>
                        
                        {/* Status Tag */}
                        <td className="py-4 px-2 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            aula.status === 'Gravando' ? 'bg-[#e11d48]/15 text-[#e11d48]' :
                            aula.status === 'Processando IA' ? 'bg-amber-500/15 text-amber-500' :
                            aula.status === 'Concluído' ? 'bg-green-500/15 text-green-500' :
                            aula.status === 'Erro de Processamento' ? 'bg-red-500/15 text-red-500' :
                            'bg-gray-500/15 text-gray-400'
                          }`}>
                            {aula.status === 'Gravando' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#e11d48] animate-ping" />
                            )}
                            {aula.status === 'Processando IA' && (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            )}
                            {aula.status}
                          </span>
                        </td>
                        
                        {/* Ações / Botões */}
                        <td className="py-4 pl-2 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {aula.status === 'Concluído' && (
                              <>
                                <button
                                  onClick={() => {
                                    setActiveResumo({
                                      titulo: aula.titulo,
                                      texto: aula.resumo_texto || 'Sem resumo disponível.'
                                    });
                                    showToast("Resumo da aula aberto.", "info");
                                  }}
                                  className="p-2 bg-[#1c1d1e] hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition duration-200 flex items-center gap-1 text-xs"
                                  title="Ler Resumo"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#f26522]" />
                                  <span className="hidden sm:inline">Resumo</span>
                                </button>
                                
                                <button
                                  onClick={() => {
                                    if (isPlayingAudio === aula.id) {
                                      setIsPlayingAudio(null);
                                      showToast("Áudio pausado.", "info");
                                    } else {
                                      setIsPlayingAudio(aula.id);
                                      showToast("Simulando reprodução de áudio via OpenRouter...", "success");
                                    }
                                  }}
                                  className={`p-2 rounded-lg transition duration-200 flex items-center gap-1 text-xs ${
                                    isPlayingAudio === aula.id 
                                      ? 'bg-[#f26522] text-white animate-pulse' 
                                      : 'bg-[#1c1d1e] hover:bg-white/10 text-gray-300 hover:text-white'
                                  }`}
                                  title="Ouvir Resumo em Áudio"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">
                                    {isPlayingAudio === aula.id ? 'Ouvindo...' : 'Áudio'}
                                  </span>
                                </button>
                              </>
                            )}

                            {aula.status === 'Erro de Processamento' && (
                              <button
                                onClick={() => handleRetryWhatsapp(aula.id)}
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-transparent rounded-lg transition duration-200 flex items-center gap-1 text-xs"
                                title="Tentar Novamente Envio WhatsApp"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Tentar Novamente</span>
                              </button>
                            )}

                            {aula.status === 'Aguardando' && (
                              <span className="text-xs text-gray-500 pr-2">Aguardando aula</span>
                            )}

                            {aula.status === 'Gravando' && (
                              <span className="text-xs text-[#e11d48] pr-2 animate-pulse font-bold">Ao Vivo</span>
                            )}

                            {aula.status === 'Processando IA' && (
                              <span className="text-xs text-amber-500 pr-2">Gerando podcast...</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* SEÇÃO INFORMATIVA SOBRE RLS MULTI-TENANCY */}
            <div className="mt-8 p-4 bg-[#090a0a]/50 border border-white/5 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-[#f26522]/10 rounded-lg text-[#f26522] flex-shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="text-xs text-gray-400">
                <span className="text-white font-bold">Multi-tenant RLS Ativo:</span> As informações mostradas são filtradas dinamicamente no Supabase com base no ID da empresa selecionada no cabeçalho.
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* DETALHE DO RESUMO SELECIONADO (MODAL INLINE SIMULADO) */}
      {activeResumo && (
        <div className="fixed inset-0 z-50 bg-[#090a0a]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121314] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold font-heading text-[#f26522] mb-2">
              Resumo da Aula
            </h3>
            <p className="text-xs font-bold text-gray-400 mb-4">{activeResumo.titulo}</p>
            <div className="bg-[#1c1d1e] p-4 rounded-xl text-sm leading-relaxed text-gray-300 border border-white/5 mb-6 max-h-[250px] overflow-y-auto">
              {activeResumo.texto}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveResumo(null)}
                className="bg-white/10 hover:bg-white/15 px-5 py-2.5 rounded-lg text-xs font-bold transition duration-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICAÇÕES (TOASTS) FLOATING */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto border transition-all duration-300 transform translate-y-0 ${
              toast.type === 'success' ? 'bg-[#f26522] text-white border-white/10' :
              toast.type === 'error' ? 'bg-red-600 text-white border-red-500/20' :
              'bg-[#121314] text-white border-white/10'
            }`}
          >
            {toast.type === 'success' && <Check className="w-4 h-4 flex-shrink-0" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {toast.type === 'info' && <Sparkles className="w-4 h-4 flex-shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
