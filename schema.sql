-- Habilitar a extensão para geração de UUID se não estiver ativa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. TABELA: aulas
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.aulas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo TEXT NOT NULL,
    descricao TEXT NULL,
    data_prevista DATE NOT NULL,
    folder_drive_id TEXT NULL,
    meet_url TEXT NULL,
    video_drive_id TEXT NULL,
    resumo_texto TEXT NULL,
    audio_url TEXT NULL,
    pdf_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Aguardando' 
        CONSTRAINT chk_aulas_status CHECK (status IN ('Aguardando', 'Em Aula', 'Processando IA', 'Pronto para Envio', 'Erro de Processamento', 'Concluído')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 2. TABELA: alunos
-- ====================================================================
-- Nota: Se a tabela 'alunos' já existir no seu banco e você desejar adaptá-la, 
-- você pode rodar este bloco ou simplesmente adicionar os campos necessários.
CREATE TABLE IF NOT EXISTS public.alunos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    telefone_whatsapp TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 3. TABELA: logs_envio
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.logs_envio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aula_id UUID NOT NULL REFERENCES public.aulas(id) ON DELETE CASCADE,
    aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
    status_envio TEXT NOT NULL DEFAULT 'Pendente'
        CONSTRAINT chk_logs_status_envio CHECK (status_envio IN ('Pendente', 'Enviado', 'Falha')),
    mensagem_erro TEXT NULL,
    tentativas INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- INDICES PARA DESEMPENHO E FILTRAGEM
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_logs_envio_aula_id ON public.logs_envio(aula_id);
CREATE INDEX IF NOT EXISTS idx_logs_envio_aluno_id ON public.logs_envio(aluno_id);
CREATE INDEX IF NOT EXISTS idx_logs_envio_status ON public.logs_envio(status_envio);

-- ====================================================================
-- FUNÇÃO E TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para tabela aulas
CREATE OR REPLACE TRIGGER trg_aulas_update_timestamp
    BEFORE UPDATE ON public.aulas
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();

-- Trigger para tabela alunos
CREATE OR REPLACE TRIGGER trg_alunos_update_timestamp
    BEFORE UPDATE ON public.alunos
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();

-- Trigger para tabela logs_envio
CREATE OR REPLACE TRIGGER trg_logs_envio_update_timestamp
    BEFORE UPDATE ON public.logs_envio
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();

-- ====================================================================
-- POLÍTICAS DE SEGURANÇA (RLS - Row Level Security)
-- ====================================================================
-- Habilitar RLS em todas as tabelas
ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_envio ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir controle total a usuários autenticados
-- (Essencial para o Next.js e os agentes que usam o cliente do Supabase com sessão ativa)

-- Aulas
CREATE POLICY "Permitir tudo para autenticados em aulas" 
    ON public.aulas 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Alunos
CREATE POLICY "Permitir tudo para autenticados em alunos" 
    ON public.alunos 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Logs Envio
CREATE POLICY "Permitir tudo para autenticados em logs_envio" 
    ON public.logs_envio 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);
