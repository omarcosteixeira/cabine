# Cabine

Fotocabine web responsiva em React, TypeScript e Vite, para Safari no iPhone, Chrome no Android e navegadores de computador.

## Fluxo do sistema

- A página inicial mostra apenas o acesso ao **Admin**, protegido por senha.
- Após entrar, o organizador cria e personaliza vários eventos ao mesmo tempo.
- Ao salvar um evento, o app gera um link externo autocontido. Use Abrir link ou Copiar link e abra esse endereço no tablet, celular ou computador da cabine.
- O link carrega as configurações do evento, incluindo nome, estilo, logo, arte e formato. As fotos e os vídeos produzidos continuam no dispositivo que abriu o link.
- O Admin também permite selecionar um evento para pré-visualização, editar, excluir e criar links atualizados.

## Recursos

- Três fotos por sessão, com contagem de 10 segundos antes de cada foto.
- Câmera frontal ou traseira, prévia espelhada na frontal, som opcional e modo de demonstração.
- Filtros colorido, preto e branco, amarelado e rosado aplicados também ao arquivo exportado.
- Eventos com nome, data, frase, cores, logo e modelo enviado em PNG, JPG ou WebP.
- Modelo como fundo ou como moldura PNG transparente, com guia de posicionamento disponível no editor.
- Tirinhas em PNG de 600 x 1800 px, com densidade de 304,8 dpi para 5 x 15 cm, e PDF de exatamente 50 x 150 mm.
- Impressão via janela do navegador e compartilhamento de arquivo quando o dispositivo oferece suporte.
- Eventos e galeria armazenados em IndexedDB, apenas no navegador utilizado.
- Manifesto e service worker para uso como aplicativo web e abertura offline após o primeiro carregamento completo.
- Evento Video 360 com captura vertical, durações de 15, 20 ou 25 segundos, saída recomendada de 1080 x 1920 px, filtros e slow motion automático nos cinco segundos finais.

## Aba de Configurações (Google Drive & Firebase)

No painel administrativo, a aba **Configurações** permite ajustar diretamente pela interface web:

1. **Google Drive API / Google Apps Script**:
   - Salva automaticamente todas as tirinhas de fotos (PNG) e vídeos 360 na sua conta do Google Drive.
   - Opção de método via **Google Apps Script Web App** (código pronto para copiar com 1 clique no painel, sem expiração de token) ou **OAuth 2.0 Direct API**.
   - Definição do ID da pasta de destino ou criação automática da pasta *"Cabine de Fotos"* e subpastas organizadas por evento.
   - Botão para **Testar Conexão** enviando um arquivo de teste e retornando o link direto do Google Drive.
   - Links diretos para os arquivos do Google Drive exibidos na galeria e no final da gravação.

2. **Firebase Firestore**:
   - Configuração dinâmica dos campos `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` e `appId` diretamente na interface.
   - Botão para **Testar Conexão** realizando teste de leitura e gravação no Firestore com feedback imediato.
   - Botão para salvar e conectar o banco em tempo real sem necessidade de novo deploy.

## Banco de dados (Firebase)

O sistema usa o **Cloud Firestore** para guardar eventos e tirinhas, então um evento criado no admin aparece em qualquer dispositivo que abrir o link.

1. No [console do Firebase](https://console.firebase.google.com), crie um projeto e ative o **Firestore Database** em modo de produção.
2. Em Configurações do projeto, adicione um **App da Web** e copie os valores de configuração.
3. Defina as variáveis de ambiente abaixo no projeto da Vercel (Produção e Preview) e, para desenvolver localmente, copie `.env.example` para `.env.local`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Publique as regras de referência do arquivo `firestore.rules` em Firestore > Regras.
5. Adicione o domínio da Vercel em Authentication > Settings > Authorized domains quando for usar login no futuro.

Enquanto alguma variável estiver ausente, o app entra em modo local: exibe o selo **Local** no admin, salva em IndexedDB e monta links autocontidos com a configuração dentro da URL. Com o Firebase ativo, o selo mostra **Firebase** e os links ficam curtos (`#event=id`), porque a configuração é lida do banco. Toda gravação também cria uma cópia local, então a cabine continua funcionando se a internet cair durante a festa.

As imagens enviadas ao Firestore são reencodeadas para caber no limite de 1 MB por documento: logo e arte são reduzidos, e a tirinha guardada no banco é uma versão otimizada de 320 px. O arquivo original em alta resolução sempre é gerado no dispositivo no momento do download ou da impressão.

## Acesso ao painel admin

A página inicial abre apenas a tela de acesso. Ao digitar a senha correta, o admin libera a criação e a edição de eventos. A senha padrão é **22130302** e pode ser trocada pela variável `VITE_ADMIN_PASSWORD` na Vercel, sem alterar o código. O desbloqueio vale apenas para a aba atual: fechar a aba ou usar o botão de cadeado no cabeçalho pede a senha novamente.

Essa verificação acontece no navegador. Ela impede o acesso casual ao painel, mas não substitui autenticação de servidor. Links de cabine compartilhados continuam abrindo sem senha, porque o dispositivo da festa precisa iniciar a câmera sem o organizador por perto.

## Publicação na Vercel

1. Envie este projeto a um repositório Git e importe-o na Vercel.
2. Selecione o preset Vite e a pasta de saída `dist`.
3. Publique. Não são necessárias variáveis de ambiente ou um backend.
4. Abra o endereço HTTPS publicado e conceda acesso à câmera. Em uma prévia dentro de iframe, a câmera pode ser bloqueada; abra o app em uma aba própria.

## Impressão

O PDF já usa uma página de 5 x 15 cm. Escolha a escala de 100%, desative cabeçalho, rodapé e margens, e configure o tamanho de papel no driver da impressora. Navegadores comuns não permitem impressão silenciosa nem conexão automática a uma impressora: a seleção acontece na janela de impressão do sistema. A compatibilidade do papel depende da impressora.

## Video 360

O modo Video 360 grava a câmera sem áudio para manter o arquivo leve e privado. Após a gravação, o navegador renderiza um novo arquivo vertical em canvas, aplica o filtro e repete os cinco segundos finais em 0,35x. O resultado pode ser baixado ou compartilhado como MP4 quando o navegador oferecer esse codec; caso contrário, será WebM. O processamento é feito no dispositivo e pode levar alguns segundos em celulares mais simples. Se o processamento não for suportado, a gravação original ainda fica disponível.

## Dados e compatibilidade

Com o Firebase configurado, eventos e tirinhas otimizadas ficam no Firestore e os links funcionam em qualquer dispositivo. Sem Firebase, os dados ficam apenas no navegador usado e a galeria pode ser perdida ao limpar o armazenamento ou navegar em modo privado. Baixe sempre os arquivos importantes.

O painel Admin usa verificação de senha no cliente, não autenticação de servidor. Não guarde dados sensíveis nele; para controle de acesso real, ative o Firebase Authentication e restrinja as regras do Firestore. Compartilhamento nativo, instalação, codecs de vídeo e impressão variam conforme navegador e sistema operacional. No iPhone, use Safari e Adicionar à Tela de Início no menu de compartilhamento.

Ao enviar uma arte personalizada, use o guia de 600 x 1800 px. As fotos ocupam três retângulos de 528 x 396 px, em x = 36 e y = 102, 519 e 936. Uma moldura deve ter essas regiões transparentes. Os textos automáticos podem ser desativados quando já estiverem incluídos na arte.

## Verificação em dispositivos

Após publicar, valide a permissão de câmera no Safari/iPhone, Chrome/Android e computador, a captura das três poses, a troca de filtros, o download, o compartilhamento disponível no sistema e a impressora física. A impressão direta sem diálogo não está incluída. O build confirma a compilação; os periféricos dependem de testes no dispositivo de destino.