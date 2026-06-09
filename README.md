# Aniversário Pajé e Letícia

Aplicação React + Express para compartilhar fotos e vídeos da festa, com QR Code para convidados, auditoria de mídia, desafios, reações e tela de telão.

## Rodar localmente

```bash
npm install
npm run dev
```

- App: http://localhost:6173
- API: http://localhost:4174

## Armazenamento de midias na AWS

O projeto esta preparado para salvar fotos no S3 por URL pre-assinada e servir as midias aprovadas pelo CloudFront.

- Bucket S3: `paje-leticia-media-647926790724`
- Regiao: `us-east-1`
- Prefixo de upload: `uploads/`
- CloudFront: `d219a1aj0u0iao.cloudfront.net`
- Distribution ID: `EDLGSD8TF9M44`
- App IAM user: `paje-leticia-app`

Boas praticas aplicadas:

- bucket privado com `BlockPublicAccess` ligado;
- ACLs desabilitadas com `BucketOwnerEnforced`;
- criptografia padrao SSE-S3;
- versionamento ativo;
- lifecycle para abortar multipart incompleto e limpar versoes antigas;
- leitura publica indireta somente via CloudFront OAC;
- permissao do app limitada ao prefixo `uploads/*`;
- credenciais fora do Git, via `.env`.

Para habilitar em producao, crie um `.env` a partir de `.env.example` e preencha as credenciais do app:

```bash
S3_BUCKET=paje-leticia-media-647926790724
S3_REGION=us-east-1
S3_UPLOAD_PREFIX=uploads
CLOUDFRONT_DOMAIN=d219a1aj0u0iao.cloudfront.net
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Fotos usam o fluxo direto para S3 com URL pre-assinada. Videos continuam passando pelo backend para normalizacao em MP4/H.264 e limite de 8 segundos antes de irem para o S3.
