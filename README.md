# Libri Agenda

Agenda administrativa multi-profissional para a operação de secretaria da Libri.

## Pacote V1 funcional

Este pacote concentra em um único deploy:

- área **Meus profissionais**
- identidade visual própria por profissional
- Home com consultas e pendências
- agenda em **Dia / Semana / Mês**
- pacientes e dados fiscais administrativos
- novo agendamento e edição
- status de consulta, pagamento e NF
- reagendamento com busca de horários válidos
- retorno em 15 / 30 / 45 / 60 dias
- bloqueios pontuais e recorrentes
- rotina semanal configurável
- cálculo de disponibilidade
- mensagens de WhatsApp editáveis por profissional
- seleção de horários para enviar pelo WhatsApp
- histórico administrativo de alterações
- D1 como banco principal
- preparação para Cloudflare Access com e-mails individuais

## Stack

- React + Vite
- Cloudflare Workers + Static Assets
- Cloudflare D1
- GitHub Actions

## Produção

O Worker usa o banco:

`libri-agenda`

Binding:

`DB`

O deploy acontece automaticamente quando há push na branch `main`.

### Secrets do GitHub

Em **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Segurança antes de cadastrar pacientes reais

A aplicação já reconhece usuários através do cabeçalho do Cloudflare Access quando `REQUIRE_ACCESS = "true"`.

No `wrangler.toml`, a V1 vem com:

```toml
REQUIRE_ACCESS = "false"
```

Isso facilita a configuração inicial, mas significa que o ambiente ainda não deve receber dados reais de pacientes enquanto estiver público.

Antes do uso real:

1. vincular o domínio desejado, por exemplo `agenda.libriconvites.com.br`;
2. proteger o aplicativo com Cloudflare Access;
3. cadastrar a administradora e a profissional na tabela `users`;
4. alterar `REQUIRE_ACCESS` para `true`.

Com Access ativo, a administradora vê todos os profissionais e uma profissional só pode consultar o próprio `professional_id`.

## Nota fiscal e PDF

A V1 permite controlar status, número, data de emissão e link do PDF.

O **upload privado do PDF** ainda não grava arquivos no D1. A implementação correta será feita com Cloudflare R2, evitando usar o banco relacional como depósito de arquivos. Até o R2 ser configurado, não envie PDF sensível para uma URL pública.

## Banco

`migrations/0001_init.sql` representa o schema atual utilizado pelo aplicativo.

O banco de produção já foi criado manualmente no Console do D1 durante a configuração inicial, portanto não rode novamente os blocos de criação sem necessidade.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Deploy manual, se necessário:

```bash
npm run cf:deploy
```
