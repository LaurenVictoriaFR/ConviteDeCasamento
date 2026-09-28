# Site do Casamento — Ruth & Victor

Site estático (HTML + CSS + JavaScript puro) para o casamento de Ruth e Victor, dia 05/12/2026.

## Como rodar localmente

Não precisa de build nem instalação. Basta abrir `index.html` no navegador, ou rodar um servidor local:

```bash
npx serve .
```

## Como hospedar no Vercel

1. Suba esta pasta para um repositório no GitHub (ou GitLab/Bitbucket).
2. Acesse [vercel.com](https://vercel.com), clique em **Add New Project** e importe o repositório.
3. Framework Preset: escolha **Other** (site estático). Não é necessário configurar build command nem output directory.
4. Clique em **Deploy**. Pronto — o site já fica no ar em poucos segundos.

Alternativa via CLI:

```bash
npm i -g vercel
vercel
```

## Configuração do Firebase (obrigatório para login, presentes e RSVP)

A lista de presentes, as confirmações de presença e o login da noiva usam o
[Firebase](https://firebase.google.com/) (gratuito) como backend, porque o
GitHub Pages sozinho só serve arquivos estáticos — não guarda dados
compartilhados entre os convidados e a noiva. Siga esses passos uma única
vez:

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com/)
   (pode desativar o Google Analytics, não é necessário).
2. No menu lateral, vá em **Build > Authentication**, clique em **Get
   started**, aba **Sign-in method**, e ative o provedor **E-mail/senha**.
3. Ainda em Authentication, aba **Users**, clique em **Add user** e crie o
   e-mail e a senha que a noiva vai usar para entrar no site. Não existe
   tela de cadastro no site — essa é a única forma de criar contas.
3b. (Opcional) Para a Portaria ter um login separado do da noiva, clique
   em **Add user** de novo e crie um e-mail terminado em `@portaria.app`
   (ex.: `portaria@portaria.app`) com a senha que quiser. No site, quem
   entrar por "Portaria" digita só a parte antes do `@` (ex.: `portaria`)
   — o `@portaria.app` é completado sozinho. Essa conta só consegue ler
   as confirmações e marcar entrada; não vê o painel da noiva.
4. No menu lateral, vá em **Build > Firestore Database**, clique em
   **Create database**, escolha "modo produção" e qualquer região.
5. Na aba **Regras** do Firestore, apague o conteúdo padrão e cole o
   conteúdo do arquivo [`firestore.rules`](firestore.rules) deste
   repositório, depois clique em **Publicar**.
6. Em **Configurações do projeto** (ícone de engrenagem) > aba **Geral** >
   role até "Seus apps" > clique no ícone `</>` (Web) para registrar um
   app. Não precisa marcar "Firebase Hosting".
7. Copie o objeto `firebaseConfig` mostrado na tela e cole em
   `js/firebase-init.js`, substituindo os valores `COLE_AQUI_...`.
8. Suba as alterações (`git push`) — o GitHub Actions já publica tudo
   automaticamente.

Essas chaves de configuração (`apiKey` etc.) não são secretas — quem
protege os dados são as regras do Firestore, não o sigilo dessas chaves.

Depois de configurado: só quem entrar com a conta criada no passo 3 vê o
botão "Painel da Noiva" (lista de convidados, confirmações de presença e
gerenciar presentes). O acesso fica em um link discreto "Acesso da noiva"
no rodapé do site. Um convidado só consegue confirmar presença depois que
a noiva cadastrar o nome dele na "Lista de convidados" — o formulário de
RSVP mostra um campo de busca com só os nomes cadastrados, então quem não foi
convidado não tem como confirmar.

> **Importante — regras do Firestore:** o arquivo `firestore.rules` mudou com
> a confirmação por QR code e a portaria. Quem já tinha publicado as regras
> antigas precisa colar o conteúdo novo em **Firestore Database > Regras** e
> clicar em **Publicar**; sem isso a confirmação de presença e a portaria
> não funcionam.
>
> **Recomendado — fechar o cadastro de contas:** em **Authentication >
> Configurações > Ações do usuário**, desative "Ativar criação (cadastro)".
> As regras tratam qualquer conta logada como "da noiva" (ler confirmações,
> marcar entrada na portaria); com o cadastro aberto, qualquer pessoa que
> conheça a chave pública do site poderia criar uma conta e se passar por ela.

## Confirmação de presença e QR code

- O convidado **digita para buscar o nome** (sem diferenciar acentos/maiúsculas)
  e escolhe o dele na lista. Quem já respondeu (sim **ou** não) sai da lista.
- Cada convidado responde **uma única vez** (garantido pelas regras do
  Firestore, não só pela tela). Quem responde "sim" recebe na hora um **QR code
  único** (nome completo + um id aleatório) e um botão **Baixar QR code (PDF)**.
  Quem responde "não" não recebe QR code.
- Para uma família confirmar várias pessoas: botão **Confirmar outra pessoa**.
- O convidado só vê o QR nessa tela. Se perder o PDF, a noiva baixa de novo em
  **Painel da Noiva > Confirmações > Baixar QR code (PDF)** e reenvia.
- Se alguém respondeu errado, a noiva usa **Excluir resposta** (mesma aba): o
  nome volta para a lista e o QR antigo deixa de valer.
- Respostas feitas **antes** desta versão não têm QR code (aparecem marcadas
  como "resposta antiga" no painel): exclua-as para o convidado responder de novo.

## Portaria (dia do casamento)

Link **Portaria** no rodapé, ao lado de "Acesso da noiva". Exige o mesmo login
da noiva (se você abrir sem estar logado, o site pede a senha e já abre a
portaria depois). Use no celular, com o site em **HTTPS** (a câmera só funciona
assim — o endereço do GitHub Pages já é HTTPS).

- No topo: em **verde** quantos convidados já entraram e em **vermelho**
  quantos confirmados ainda faltam chegar. A lista mostra cada confirmado como
  *Presente* (com o horário) ou *Aguardando*, com busca por nome.
- **Ler QR code** abre a câmera. Resultados possíveis:
  - *Entrada liberada* (verde): o convidado é marcado como Presente.
  - *QR code já utilizado* (amarelo): esse QR já foi lido (só vale uma vez).
  - *Pessoa não está na lista* (vermelho): nome + id não batem com nenhum
    convidado confirmado.
  - *QR code inválido* (vermelho): não é um QR deste convite.
- Duas leituras ao mesmo tempo do mesmo QR não passam as duas: a entrada é
  registrada numa transação do Firestore.

## Testes

Os testes ficam em `tests/` e **não** fazem parte do site publicado (precisam de
Node, Java e do navegador Edge ou Chrome instalados):

```bash
cd tests
npm install
npm run test:unit    # busca, id aleatório, conteúdo do QR e PDF (Node puro)
npm run test:rules   # regras do Firestore no emulador (20 casos)
npm run test:e2e     # site inteiro no navegador, com câmera falsa lendo QR codes
```

## O que ainda falta preencher

- **Fotos dos noivos**: em `index.html`, procure pelas divs com classe `photo-placeholder`
  (seção "Nossa História") e troque por uma tag `<img src="images/ruth.jpg" alt="Ruth" />`
  quando tiver as fotos. Coloque os arquivos de imagem dentro da pasta `images/`.
- **Local da cerimônia**: seção "Cerimônia & Festa" em `index.html` — troque o texto
  "Local a ser divulgado em breve" pelo endereço real.
- **Lista de convidados**: antes de divulgar o link de RSVP, a noiva precisa cadastrar
  os nomes na "Lista de convidados" do Painel da Noiva (aceita colar vários nomes de
  uma vez, um por linha) — sem isso ninguém consegue confirmar presença.
- **Lista de presentes**: não é mais um array fixo no código — a noiva cadastra os
  presentes pelo próprio site, no "Painel da Noiva" (depois de logar), uma vez que o
  Firebase estiver configurado (veja seção acima). A foto do presente (opcional) é
  redimensionada no próprio navegador e gravada como base64 dentro do documento no
  Firestore — não é necessário configurar o Firebase Storage.

## Estrutura

```
index.html            -> conteúdo e estrutura das seções
css/style.css          -> estilo visual (cores, fontes, layout)
js/main.js             -> contagem regressiva, presentes, RSVP, login e painel da noiva
js/portaria.js         -> portaria: leitura de QR code pela câmera, validação e painel de entradas
js/guest-utils.js      -> funções puras: busca sem acento, id aleatório, conteúdo do QR
js/qr-pdf.js           -> gera o QR code na tela e o PDF do convidado
js/vendor/             -> bibliotecas de terceiros (qrcode-generator, jsPDF, jsQR), sem CDN
js/firebase-init.js    -> configuração/inicialização do Firebase (cole suas chaves aqui)
firestore.rules        -> regras de segurança do banco (colar no Console do Firebase)
firebase.json          -> só para os testes com emulador (tests/)
tests/                 -> testes automatizados (ver seção "Testes")
images/                -> fotos do casal + flor-galho-1.png / flor-galho-2.png (galhos florais, fundo transparente)
fonts/                 -> Shelley Script LT Std (principal), Arima Madurai (secundária) e Genty (só no "&")
```

## Identidade visual

- **Cores** (ver `cores.txt`): principal `#66280a`, secundárias `#9a5833` e `#7c3b1a`.
- **Fontes**: Shelley Script LT Std (títulos, nomes, números), Arima Madurai (textos e rótulos)
  e Genty (usada só no símbolo "&", em todo o site), carregadas localmente via `@font-face`
  em `css/style.css` — sem dependência do Google Fonts.
- **Calendário do casamento**: montado direto em HTML/CSS na seção "Cerimônia & Festa"
  (não é mais uma imagem), com o dia 5 de dezembro de 2026 marcado com um coração.
