# Torn Pro Stats · 4M Goal System

Dashboard pessoal de análise e otimização de progressão de stats no Torn, com objetivo de 4,000,000 de stats totais. Mobile-first, dark mode, instalável como app no ecrã principal do iPhone.

## Estrutura

```
index.html      → estrutura da app
style.css       → todo o estilo (dark HUD theme)
app.js          → toda a lógica (auth, API Torn, otimizador de viagens, etc.)
manifest.json   → metadados da PWA (nome, ícones, cor)
sw.js           → service worker (permite abrir offline / cache da app)
icons/          → ícones para o ecrã principal (192, 512, 180px + favicon)
```

## Publicar no GitHub Pages

1. Cria um repositório novo no GitHub (pode ser privado — recomendado, já que esta app é de uso pessoal).
2. Faz upload de **todos os ficheiros desta pasta** para a raiz do repositório (mantém a pasta `icons/` tal como está).
3. Vai a **Settings → Pages** no repositório.
4. Em "Build and deployment" → **Source**, escolhe **Deploy from a branch**.
5. Escolhe a branch `main` e a pasta `/ (root)` → **Save**.
6. Ao fim de 1–2 minutos o GitHub dá-te um link tipo:
   `https://teu-utilizador.github.io/nome-do-repo/`

   > Nota: se o repositório for **privado**, o GitHub Pages normal não funciona em contas gratuitas — tens de o tornar público, ou usar GitHub Pages com conta Pro/Team que suporta sites privados. Como a app já tem password própria + a API key fica só no teu telemóvel (nunca é enviada para lado nenhum a não ser para a API oficial do Torn e para a YATA), tornar o repositório público é seguro — ninguém consegue entrar na tua conta só por ver o código.

## Instalar no iPhone

1. Abre o link do GitHub Pages no **Safari** (tem de ser Safari, não funciona a partir de outro browser no iOS).
2. Toca no ícone de partilha (quadrado com seta para cima).
3. **"Adicionar ao Ecrã Principal"**.
4. Confirma — vai aparecer um ícone "4M Tracker" no teu ecrã principal, abre em ecrã inteiro, sem barra do Safari.

## Atualizar a app no futuro

Sempre que quiseres alterar algo, basta editar os ficheiros no GitHub (ou pedir-me para gerar uma nova versão) e fazer commit. O `sw.js` deteta a mudança e atualiza a app sozinho da próxima vez que a abrires (pode ser preciso fechar e reabrir a app duas vezes para o iOS aplicar a atualização — comportamento normal de PWAs no iOS).

## Notas importantes

- A password, a API key do Torn e todo o histórico ficam guardados **só no teu iPhone** (`localStorage`), nunca são enviados para o GitHub nem para nenhum servidor além da própria API do Torn.
- O otimizador de viagens usa stocks estrangeiros da base de dados comunitária **YATA** (a API oficial do Torn não expõe essa informação) — pode ter alguns minutos de atraso.
- Service worker = a app abre mesmo sem internet, mas os dados (stats, stocks) só atualizam com ligação.
