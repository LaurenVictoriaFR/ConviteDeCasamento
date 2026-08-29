// ------------------------------------------------------------------
// FIREBASE — configuração e inicialização
// ------------------------------------------------------------------
// Cole aqui embaixo o objeto de configuração do seu app Web, disponível em:
// Firebase Console > Configurações do projeto > Seus apps > (ícone </>) > SDK
// do Firebase. Veja o passo a passo completo no README.md ("Configuração
// do Firebase").
//
// Essas chaves são públicas por natureza (ficam expostas em qualquer app
// Web que usa Firebase) — quem protege os dados são as regras de
// segurança em firestore.rules, não o sigilo destas chaves.
//
// Usamos aqui o SDK "compat" do Firebase (scripts clássicos, carregados no
// <head>/<body> do index.html) em vez do SDK modular (import/export), para
// o site continuar funcionando só de abrir o index.html com duplo clique
// (o navegador bloqueia módulos ES carregados via arquivo local).
var firebaseConfig = {
  apiKey: 'AIzaSyCMbsMiYABlkNOG9JacJy2h81LDJWFR0D0',
  authDomain: 'convitedecasamentoruth.firebaseapp.com',
  projectId: 'convitedecasamentoruth',
  storageBucket: 'convitedecasamentoruth.firebasestorage.app',
  messagingSenderId: '161019075167',
  appId: '1:161019075167:web:f369926c73b832c71219ea',
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();
