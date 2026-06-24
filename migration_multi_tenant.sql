-- ====================================================================
-- MIGRATION: TRANSFORMAÇÃO EM MULTI-TENANT (SaaS B2B)
-- ====================================================================

-- 1. CRIAÇÃO DA TABELA DE TENANTS (empresas)
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger para updated_at da tabela empresas
CREATE OR REPLACE TRIGGER trg_empresas_update_timestamp
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();

-- 2. ALTERAÇÃO DAS TABELAS EXISTENTES PARA ADICIONAR O TENANT ID (empresa_id)
ALTER TABLE public.aulas 
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.alunos 
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.logs_envio 
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Criar índices para a coluna tenant nos relacionamentos
CREATE INDEX IF NOT EXISTS idx_aulas_empresa_id ON public.aulas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_alunos_empresa_id ON public.alunos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_logs_envio_empresa_id ON public.logs_envio(empresa_id);

-- 3. FUNÇÃO AUXILIAR PARA RECUPERAR O empresa_id DO USUÁRIO LOGADO
-- No Supabase, o recomendado para multi-tenancy é armazenar o id do tenant
-- no 'app_metadata' do usuário (Auth). Essa função extrai esse dado do JWT de forma segura.
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS UUID AS $$
    SELECT NULLIF(
        current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'empresa_id',
        ''
    )::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. CONFIGURAÇÃO DE SEGURANÇA (RLS) E POLÍTICAS SAAS

-- Remover políticas anteriores que permitiam tudo a qualquer autenticado
DROP POLICY IF EXISTS "Permitir tudo para autenticados em aulas" ON public.aulas;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em alunos" ON public.alunos;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em logs_envio" ON public.logs_envio;

-- Ativar RLS em todas as tabelas (incluindo a tabela empresas)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_envio ENABLE ROW LEVEL SECURITY;

-- Políticas para a tabela 'empresas' (Tenant)
-- O usuário autenticado só pode ver/editar a própria empresa definida em seu JWT
CREATE POLICY "Gerenciamento da própria empresa" 
    ON public.empresas 
    FOR ALL 
    TO authenticated 
    USING (id = public.get_empresa_id())
    WITH CHECK (id = public.get_empresa_id());

-- Políticas para a tabela 'aulas'
CREATE POLICY "Isolamento multi-tenant para aulas" 
    ON public.aulas 
    FOR ALL 
    TO authenticated 
    USING (empresa_id = public.get_empresa_id())
    WITH CHECK (empresa_id = public.get_empresa_id());

-- Políticas para a tabela 'alunos'
CREATE POLICY "Isolamento multi-tenant para alunos" 
    ON public.alunos 
    FOR ALL 
    TO authenticated 
    USING (empresa_id = public.get_empresa_id())
    WITH CHECK (empresa_id = public.get_empresa_id());

-- Políticas para a tabela 'logs_envio'
CREATE POLICY "Isolamento multi-tenant para logs_envio" 
    ON public.logs_envio 
    FOR ALL 
    TO authenticated 
    USING (empresa_id = public.get_empresa_id())
    WITH CHECK (empresa_id = public.get_empresa_id());
