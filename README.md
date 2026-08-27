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

## O que ainda falta preencher

- **Fotos dos noivos**: em `index.html`, procure pelas divs com classe `photo-placeholder`
  (seção "Nossa História") e troque por uma tag `<img src="images/ruth.jpg" alt="Ruth" />`
  quando tiver as fotos. Coloque os arquivos de imagem dentro da pasta `images/`.
- **Local da cerimônia**: seção "Cerimônia & Festa" em `index.html` — troque o texto
  "Local a ser divulgado em breve" pelo endereço real.
- **Lista de presentes real**: os cartões de presente (`js/main.js`, array `GIFTS`) estão
  todos com o valor simbólico de R$ 100,00. Quando a lista definitiva estiver pronta, edite
  esse array com os itens reais (nome, valor, link de pagamento/PIX).
- **Confirmação de presença (RSVP)**: por padrão as respostas do formulário ficam salvas
  apenas no navegador de quem preenche (`localStorage`), só para não perder a mensagem.
  Para receber as confirmações por e-mail de verdade:
  1. Crie uma conta gratuita em [formspree.io](https://formspree.io) e crie um formulário.
  2. Copie o endpoint (algo como `https://formspree.io/f/xxxxxxx`).
  3. Cole no topo de `js/main.js`, na constante `FORMSPREE_ENDPOINT`.
- **Chave PIX dos presentes**: no modal de presentes (`index.html`, seção `#giftModal`),
  troque "a definir" pela chave PIX real do casal.

## Estrutura

```
index.html        -> conteúdo e estrutura das seções
css/style.css      -> estilo visual (cores, fontes, layout)
js/main.js         -> contagem regressiva, presentes, formulário de RSVP
images/            -> fotos do casal + flor-galho-1.png / flor-galho-2.png (galhos florais, fundo transparente)
fonts/             -> Shelley Script LT Std (principal), Arima Madurai (secundária) e Genty (só no "&")
```

## Identidade visual

- **Cores** (ver `cores.txt`): principal `#66280a`, secundárias `#9a5833` e `#7c3b1a`.
- **Fontes**: Shelley Script LT Std (títulos, nomes, números), Arima Madurai (textos e rótulos)
  e Genty (usada só no símbolo "&", em todo o site), carregadas localmente via `@font-face`
  em `css/style.css` — sem dependência do Google Fonts.
- **Calendário do casamento**: montado direto em HTML/CSS na seção "Cerimônia & Festa"
  (não é mais uma imagem), com o dia 5 de dezembro de 2026 marcado com um coração.
