# Libri Agenda

Base inicial da plataforma de agenda multi-profissional da Julianna.

## O que já existe nesta pasta

- React + Vite para a interface.
- Home responsiva com identidade visual por profissional.
- Estrutura inicial multi-profissional.
- Dados de demonstração da Dra. Bianca, sem pacientes reais.
- Worker Cloudflare inicial com endpoint de saúde e leitura de profissionais.
- Schema D1 com profissionais, usuários, pacientes, consultas, bloqueios, disponibilidade, valores, mensagens, NF e auditoria.
- Seed inicial da Dra. Bianca com os valores já informados.

## Importante

Esta versão é uma fundação/protótipo. **Não cadastre pacientes reais ainda.** O login e a autorização do backend ainda serão implementados antes de a plataforma entrar em uso real.

## Rodar no computador

1. Instale Node.js 20 ou superior.
2. Abra o terminal dentro desta pasta.
3. Rode:

```bash
npm install
npm run dev
```

4. Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

## Próximas etapas

1. Subir esta pasta para um repositório privado no GitHub.
2. Conectar o repositório ao Cloudflare.
3. Criar o banco D1 `libri-agenda`.
4. Aplicar `migrations/0001_init.sql`.
5. Aplicar `migrations/0002_seed_demo_bianca.sql`.
6. Ligar o binding `DB` no `wrangler.toml`.
7. Implementar autenticação e autorização antes de usar dados reais.
8. Construir agenda Dia/Semana/Mês, cadastro de pacientes, reagendamento inteligente, pendências, mensagens, pagamento e NF.

## Estrutura

```text
libri-agenda/
├─ src/                 Interface React
├─ worker/              API Cloudflare Worker
├─ migrations/          Banco Cloudflare D1
├─ wrangler.toml        Configuração Cloudflare
├─ package.json
└─ README.md
```

## Princípio do projeto

Nenhuma regra deve ser escrita como se Bianca fosse fixa no código. Toda consulta, paciente, configuração, mensagem e identidade visual pertence a um `professional_id`, para que a plataforma possa receber outros profissionais depois.

## Publicação automática pelo GitHub

O arquivo `.github/workflows/deploy.yml` publica automaticamente no Cloudflare Workers quando houver push na branch `main`.

Antes do primeiro deploy, cadastre no repositório do GitHub, em **Settings → Secrets and variables → Actions**, estes secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

O workflow instala as dependências, gera o build do React/Vite e executa `wrangler deploy`.

O `wrangler.toml` está configurado para servir o frontend em `dist` como SPA e enviar as rotas `/api/*` primeiro para o Worker.
