# Stitch prompts · Conversations (اتكلّم / اتعلّم, voice-first)

How to use: open the existing Stitch project (Warm Editorial). Paste the **Design brief** once as the first message, then paste one screen prompt at a time. Generate the mobile size. If Stitch drifts from the style, paste the brief again before the next screen.

Screens: 14. The conversation screens (05–10) are the important ones. Do them first, and get them right before the pickers.

---

## Design brief (paste first)

Mobile app, 390px wide, **RTL Arabic interface** for Egyptian learners of European Portuguese. Arabic UI text is Egyptian colloquial. Portuguese text is always left-to-right inside its own bubble or chip.

Style: "Warm Editorial Learning Mobile Experience", the same as the existing screens in this project.
- **Background:** warm cream paper #FFF8F2; sections #FEF2E1.
- **Cards and bubbles:** white #FFFFFF, radius 20–24px, soft diffuse shadow (0 8px 24px rgba(32,50,50,0.08)), no heavy outlines.
- **Primary:** deep teal #14545A, for titles, active chips, the learner's bubbles and dark hero cards.
- **Action:** coral #F56D4E, for primary pill buttons, the mic button and progress. Coral tint #FFDAD2.
- **Note:** mustard #FEE263 with a gold left border #E1C64A, for the Egyptian coach notes (💡 or 🟨 icon).
- **Mistakes:** amber #E8A13A only, never red.
- **Type:**
  - Newsreader serif for Portuguese sentences and big titles;
  - Noto Sans Arabic for all Arabic, one size step larger than Latin;
  - Inter for small Latin labels and numbers.
- **Characters** are illustrated in hand-drawn ink with soft watercolour, adult and warm, never cartoon mascots. Avatars are circular.
  - **Inês:** late 20s, freckles, wavy chestnut hair, mustard cardigan.
  - **Tiago:** about 24, dark brown skin, short twisted hair, big smile, red hoodie, earbuds around his neck.
  - **Nour:** early 30s, medium brown skin, dusty-rose hijab, cream trench coat.
- Icons: Material Symbols Rounded. Touch targets ≥44px. 16px side gutters.
- **Don't add:** streak flames, XP, hearts, English labels, red error states, or a bottom tab bar on conversation screens.

---

## 01 · Talk home (choose a mode)

Screen title at the top right: «اتكلّم مع حد» in deep teal, with the small subtitle «اختار عايز تعمل إيه النهارده». Below it, two large stacked cards, full width, each about 200px tall:

1. **Practice card**
   - deep teal fill, white text;
   - a watercolour illustration of Inês and Tiago chatting at a café table;
   - big title «🗣️ اتكلّم», subtitle «اتمرّن تتكلم برتغالي في أي موضوع»;
   - a small white chip «صوت أولاً 🎙️».
2. **Learn card**
   - cream-yellow fill #FEF2E1;
   - a watercolour illustration of an open notebook with a small Lisbon street map;
   - title «📖 اتعلّم» in deep teal, subtitle «افهم موضوع خطوة بخطوة، بالمحادثة».

Below the cards: a mustard note card «💡 تقدر تسأل بالعربي في أي وقت، وفيه زرار يساعدك ترد لو وقفت.»

The last-used card has a small «آخر مرة» pill.

## 02 · Practice picker

Header with a back arrow, title «اتكلّم» and subtitle «اختار موضوع، أو اتكلم في أي حاجة».

**First, a full-width hero card:**
- deep teal, white text;
- «أي حاجة 💬» and subtitle «اتكلم في أي موضوع إنت عايزه»;
- three small overlapping circular avatars (Inês, Tiago, Nour) on the left.

**Then a 2-column grid of topic cards** (white, radius 20). Each card has:
- a small watercolour vignette;
- the Portuguese title in Newsreader;
- the Arabic subtitle under it;
- the character's tiny avatar in the corner.

Cards: «A casa · البيت», «O trabalho · الشغل», «O bairro · الحي والشارع», «Os transportes · المواصلات», «Ontem · عملت إيه إمبارح», «Amanhã · هتعمل إيه بكرة», «O ginásio · الجيم», «A comida · الأكل», «As compras · الشوبينج», «O fim de semana · الويك إند», «A família · العيلة», «O Egito · مصر والغربة».

One card («A casa») has a coral pill «كمّل» and a thin coral progress bar at 40%.

## 03 · Learn picker

Header «اتعلّم», subtitle «اختار موضوع من دروسك».

A vertical list of white rows (radius 14). Each row has:
- a small watercolour icon;
- the Portuguese title;
- the Arabic subtitle;
- a status chip on the left:
  - 🟢 «كويس» (green text on a light green fill);
  - 🟡 «محتاج مراجعة» (mustard);
  - ⚪ «لسه» (grey).

Rows:
- «Onde fica? · الاتجاهات» 🟡;
- «No café · في الكافيه» 🟢;
- «O vizinho · الجيران» ⚪;
- «Na farmácia · في الصيدلية» ⚪;
- «Ser e estar · أنا مين وأنا عامل إيه» 🟢.

Locked rows are faded, with a small lock and «بعد درس 24».

The last row is a dashed-outline card: «موضوع جديد ✍️», «قولنا عايز تتعلم إيه وهنجهّزهولك».

## 04 · New topic request (bottom sheet over 03)

A bottom sheet on cream with a grabber.
- Title «عايز تتعلم إيه؟».
- A large rounded text field with the placeholder «مثلاً: إزاي أفتح حساب في البنك».
- Below it, example chips: «في البنك», «عند الدكتور», «إيجار شقة», «في المطعم».
- A coral pill button «ابعت».

Second state of the same sheet, after sending: a mustard note «🙏 سجّلنا طلبك وهنجهّزه قريب» and an outlined button «رجوع».

## 05 · Conversation, voice mode, character speaking ★

The main screen.

**Header:**
- back arrow;
- the circular avatar of Inês with «Inês» and the topic «A casa · البيت» under it;
- on the left, a small «خلّص» outlined pill and a «⋯» menu.

**Conversation area** (scrolls). At the top, a mustard coach note: «🟨 هنتكلم مع Inês عن البيت. اتكلم براحتك، ولو وقفت دوس "ساعدني أرد".» Then:

1. **Inês's bubble** (white, left-aligned in the RTL layout, with the avatar beside it):
   - Portuguese in Newsreader: "Olá Omar! 😊 Eu moro em Alfama, num apartamento pequeno. E tu, onde moras?";
   - under it, a grey line of Arabic-letter pronunciation «أولا عومار! إيو مورو إين ألفاما…»;
   - a small link «معناها؟»;
   - a round speaker button.
   - This bubble is **playing**: a thin animated teal waveform in the bubble, and the current word lightly highlighted in pale yellow.
2. **Learner's bubble** (deep teal, white Newsreader text), above it: "Olá! Tudo bem."

**Bottom dock** (fixed, cream with a soft top shadow):
- a row of three small outlined chips: «Pode repetir?», «Mais devagar», «Não percebi»;
- below them, in the centre, a **large coral circular mic button** (72px) with a mic icon;
- to its right, a smaller teal-outlined circle «اسأل بالعربي 🇪🇬»;
- to its left, a small keyboard icon button;
- above the mic, a slim text link «ساعدني أرد 🤝».

## 06 · Conversation, voice mode, recording

Same screen as 05. The character has finished: her bubble shows a small check and the replay button.

The bottom dock is in the recording state:
- the coral mic button is larger, with a pulsing ring and a white stop/send icon;
- above it, a live audio level bar in coral and a timer «0:04»;
- the label «بتسجّل… دوس تاني للإرسال»;
- the help and survival chips are dimmed.

## 07 · After speaking: transcript and recast

Conversation shows, top to bottom:
1. **The learner's new teal bubble:** "Nao meu casa é pocenuo". Under it, a tiny grey link «مش ده اللي قلته؟» with a 3-second circular countdown.
2. **Inês's reply bubble:** "Ah, a tua casa é pequena! A minha também. 😄 Quantos quartos tem?". The words "a tua casa é pequena" are underlined with a soft amber dotted line (the recast). Pronunciation line, «معناها؟», and the speaker button.

The dock is back to idle.

## 08 · Help: "ساعدني أرد" open (voice mode)

Same conversation. A white card slides up above the dock. It has:
- a mustard strip at the top, «🟨 قول فيه كام أوضة: Tem + العدد»;
- the frame "Tem ___." large in Newsreader;
- three answer chips (white, teal outline): "Tem um quarto.", "Tem dois quartos.", "Tem três quartos.".

The second chip is selected and expanded:
- the sentence "Tem dois quartos." very large, in deep teal;
- the pronunciation «تين دوش كوارتوش» under it;
- a round play button;
- the instruction «قولها 🎙️».

The coral mic below is armed, with a soft glow. A small close «✕» sits at the card's corner.

## 09 · Ask in Arabic (coach side channel)

**State A, recording:** the secondary button «اسأل بالعربي 🇪🇬» is active and teal-filled, and the main mic is greyed out. Above the dock: a teal level bar and the label «بتسجّل بالعربي…».

**State B, answer:** in the conversation,
- a small right-aligned grey bubble with the learner's Arabic question «ازاي أقول مع مراتي؟» and a tiny «للمدرّس» tag;
- then a mustard coach note card with the 💡 icon: «مع مراتي = **com a minha mulher**. جرّب: Moro com a minha mulher.», with a play button for the Portuguese part;
- Inês's last bubble above stays as it was, with a small «مستنياك… 😊» status under her avatar.

## 10 · Text mode

The same conversation, with the dock switched to text:
- a rounded white input with the placeholder «Escreve em português…»;
- a coral circular send button;
- a small mic icon to switch back to voice;
- above the input, a horizontal row of accent keys as small pills: à á â ã ç é ê í ó ô õ ú;
- the survival chips and «ساعدني أرد» stay above the accent row.

A small toast at the top: «⌨️ اتحوّلت للكتابة، دوس المايك ترجع للصوت».

## 11 · Open mode "أي حاجة": first message and partner switch

**Header:** the avatar of Inês with a small chevron. Tapping it opens a compact popover with three partner rows:
- «Inês · بتحب الطبخ والأكل»;
- «Tiago · كورة وجيم ومواصلات»;
- «Nour · مصرية عايشة هنا من 3 سنين».

The selected one has a teal check.

**Conversation:**
- a coach note «🟨 اتكلم في أي حاجة. Inês هتمشي معاك»;
- then Inês's bubble: "Olá Omar! 😊 Sobre o que queres falar hoje?", with «معناها؟»;
- under her bubble, wrapping suggestion chips: "Sobre o meu dia", "Futebol ⚽", "Comida", "Carros 🚗", "O trabalho".

Voice dock as in 05.

## 12 · Coach suggestion (switch to learn), inline

Inside a practice conversation (Tiago, «Os transportes»), after a few Arabic questions, a wider mustard card appears between the bubbles:
- «💡 شكلك محتاج تفهم الاتجاهات. تحب ندخل "اتعلّم" شوية؟»;
- two buttons: a coral pill «يلا نتعلّم» and an outlined pill «لأ، نكمّل كلام».

Below it, Tiago's last bubble is still waiting.

## 13 · Summary ("خلّص")

A full screen on cream.
- **Top:** the avatar of Inês with a small wave illustration, the title «برافو يا عمر! 👏» and the subtitle «اتكلمت 7 دقايق عن البيت».
- **Card 1, «قلتها بالبرتغالي»:** a list of the learner's sentences in Newsreader, each with a small green check: "Moro em Amadora.", "A minha casa é pequena.", "Tem dois quartos.", "Moro com a minha mulher.".
- **Card 2, «اتصلّحت وإنت بتتكلم»:** amber-accented rows, each showing what was said, struck through in grey, then → the correct version in teal:
  - "meu casa é pocenuo" → "a minha casa é pequena";
  - "eu gosto comer" → "eu gosto de comer".

  Each row has a small toggle «ضيفها للكروت» (on).
- **Bottom:** a coral pill button «تمام» and an outlined pill «اتكلم تاني».

Learn-mode variant: add a teal card at the top «📖 خلّصت الاتجاهات!» with the 10 words as chips (green = بتقولها, mustard = بتفهمها), and a coral button «اتكلم عنه دلوقتي».

## 14 · Learn conversation, voice (directions, day 18)

Header: Inês's avatar, «Onde fica? · الاتجاهات», and a row of progress dots for 3 groups (the first filled coral).

**Pinned at the top:** a small illustrated map card (watercolour Lisbon street):
- metro exit, a traffic light, a corner café and a house;
- a coral dotted route with a pulsing dot for Inês at the metro exit;
- an arrow pointing right.

**Conversation:**
- **a word card row** (white mini cards), each with a big arrow icon, the Portuguese word in Newsreader, pronunciation and a speaker:
  - "➡️ direita · ديرايتا · يمين";
  - "⬅️ esquerda · إشكيردا · شمال";
  - "⬆️ em frente · إين فرينت · على طول";
- a coach note: «🟨 Inês جاية لك وهتتوه 😄 وجّهها بالكلمات دي»;
- Inês's bubble: "Estou no metro. 🚇 Direita ou esquerda?";
- two large choice chips under it: "Direita" and "Esquerda".

Voice dock as in 05.
