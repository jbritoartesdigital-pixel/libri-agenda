# Deploy deste pacote

1. Extraia `libri-agenda-v1.zip`.
2. Abra o repositório `libri-agenda` no GitHub.
3. Substitua os arquivos do projeto pelos arquivos desta pasta.
4. Faça **um único commit na `main`**.
5. Aguarde **Actions → Deploy Libri Agenda** ficar verde.
6. Abra o endereço do Worker e teste a interface.

O banco D1 já está configurado no `wrangler.toml` e este pacote usa o schema que já foi criado no D1 durante a configuração.

## Não precisa fazer agora

- não rode novamente os SQLs de criação;
- não crie outro banco;
- não altere os secrets do GitHub;
- não conecte Google Calendar;
- não faça deploy arquivo por arquivo.

## Importante

Enquanto Cloudflare Access não estiver ativado, use somente dados de teste. A próxima etapa depois de validar a V1 é proteger o domínio com os dois acessos individuais: administradora e profissional.
