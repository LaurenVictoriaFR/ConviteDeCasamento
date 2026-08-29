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
   tela de cadastro no site — essa é a única conta e só pode ser criada
   por aqui.
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
RSVP mostra um seletor com só os nomes cadastrados, então quem não foi
convidado não tem como confirmar.

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
  Firebase estiver configurado (veja seção acima).

## Estrutura

```
index.html            -> conteúdo e estrutura das seções
css/style.css          -> estilo visual (cores, fontes, layout)
js/main.js             -> contagem regressiva, presentes, RSVP, login e painel da noiva
js/firebase-init.js    -> configuração/inicialização do Firebase (cole suas chaves aqui)
firestore.rules        -> regras de segurança do banco (colar no Console do Firebase)
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
