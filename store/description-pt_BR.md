# Página da loja — Português (Brasil)

## Nome (manifest appName, 1.0.1)
Popout Authenticator — autenticador 2FA

## Resumo (manifest appDesc, até 132 caracteres)
Autenticador 2FA de código aberto. Códigos de uso único em pop-up, janela ou painel lateral, com bloqueio por senha.

## Descrição
(Colar como texto simples, sem os **. No máximo cinco nomes de outros produtos, conforme as perguntas frequentes sobre spam da Chrome Web Store.)

O Popout Authenticator mostra seus códigos de uso único de verificação em duas etapas (2FA) direto no navegador: no pop-up da barra de ferramentas, em uma janela separada ou no painel lateral. Ele gera códigos TOTP e HOTP padrão, é de código aberto (MIT), não limita o número de contas e não precisa de cadastro nem de servidor.

**Vindo de outro autenticador**
- Importa o arquivo de backup da extensão Authenticator (authenticator.cc), inclusive backups protegidos por senha.
- Compatível com os QR codes de exportação do Google Authenticator™.
- Importa backups em texto simples de outros apps autenticadores, além de arquivos no formato padrão de troca de credenciais (CXF). Apps compatíveis (em inglês): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Backups criptografados de alguns apps não podem ser abertos aqui. Nesse caso, exporte antes um backup em texto simples nesse app.

**Abra onde você precisar**
- Use no pop-up da barra de ferramentas, em uma janela separada ou no painel lateral (barra lateral no Firefox).
- Busca, grupos, contas fixadas e visualização compacta mantêm listas longas organizadas.
- Mostra primeiro a conta do site em que você está e preenche o código com um clique, pelo menu do botão direito ou com um atalho de teclado.
- Botões opcionais ao lado dos campos de código nos sites que você escolher.

**Adicione contas do seu jeito**
- Leia um QR code da aba atual, da câmera, de uma imagem ou da área de transferência.
- Cole links otpauth:// ou digite a chave secreta à mão.
- Suporta TOTP e HOTP com SHA-1, SHA-256 ou SHA-512 e de 6 a 10 dígitos, além de Steam (5 caracteres) e Battle.net (8 dígitos).

**Privado e protegido**
- As contas ficam no seu dispositivo em um cofre criptografado com AES-256-GCM. Defina uma senha para proteger a chave dele: sem senha, a chave fica no dispositivo junto com os dados.
- Bloqueie com senha (Argon2id), código de recuperação e, se quiser, desbloqueio por chave de acesso (indisponível no Firefox). Escolha quando ele bloqueia automaticamente.
- Se quiser, exija a verificação do dispositivo antes de usar um código (indisponível no Firefox) e oculte os códigos com um atalho definido por você.
- Sem análise de uso, sem anúncios, sem servidor do desenvolvedor. O código-fonte é público.

**Não perca o acesso**
- Backups criptografados e exportação para texto otpauth, CXF e QR codes.
- Sincronização entre seus dispositivos pela sincronização do próprio navegador (Chrome, Edge, Firefox), criptografada quando o bloqueio por senha está ativo.
- Instantâneos de recuperação, lixeira de 30 dias e histórico de alterações de cada conta.
- A verificação do relógio avisa quando a hora do computador faria os códigos falharem.

**Compartilhe um código, não o segredo**
- Envie um link que mostra só os códigos dos próximos 5 a 60 minutos, com senha opcional. O link nunca contém a chave secreta.

**Bom saber**
- Não há backup na nuvem mantido pelo desenvolvedor. Os backups são arquivos que você guarda; a sincronização usa a do próprio navegador.
- O desbloqueio por chave de acesso e a verificação do dispositivo não estão disponíveis no Firefox. A versão para Safari é só para macOS.

Disponível em 20 idiomas. Suporta políticas gerenciadas para organizações.

O Popout Authenticator é feito por um desenvolvedor independente. Ele se baseia no código e nas traduções com licença MIT da extensão Authenticator (authenticator.cc) e não tem relação com os autores dela.

Google Authenticator é uma marca da Google LLC.

Política de privacidade: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Código-fonte: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `no painel lateral (barra lateral no Firefox)` → `no painel lateral`
- `desbloqueio por chave de acesso (indisponível no Firefox)` → `desbloqueio por chave de acesso`
- `antes de usar um código (indisponível no Firefox)` → `antes de usar um código`
- `pela sincronização do próprio navegador (Chrome, Edge, Firefox),` → `pela sincronização do Microsoft Edge,`
- 이 줄을 뺀다: `- O desbloqueio por chave de acesso e a verificação do dispositivo não estão disponíveis no Firefox. A versão para Safari é só para macOS.`
