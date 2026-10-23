<!--
Source: Claude Docs "Langify · قاعدة توليد الدروس والصور" — https://claude.ai/code/artifact/6eac3733-f650-44ef-a5f1-0ad63e1bc7c8
Exported 2026-10-19. Language: Egyptian Arabic, with prompts and field names in English.
-->
# 03 · Generation pipeline and learning systems

> **For Cursor, in English:** this is the detailed spec for lesson generation (Claude prompts, the request message per day, automatic checks), images (style, cast, `image_spec`, prompt templates, QA), flashcards, micro learning, daily use and gaps, the question bank, progress and error storage, and the practice agent prompts.
>
> **Superseded parts:** read these with `02-content-schema.md` and `00-decisions.md`.
> - "شكل الصفحة" and "حقول كل نوع صفحة" (pages phrases / rule / dictionary / self_test / chat / done / story) describe the older page model. The page structure is now **blocks + presets + modes** from `02`. The day's sequence of steps still holds; each step is now one or more pages built from presets.
> - In the Claude system prompt below, the `PAGE STEPS` block is replaced by the `PAGES` block at the end of `02`. The per-day request also gains `VERB_TABLE` and `PAGE_PLAN` (see `02`).
> - Grader and reactor: `corrected_pt` is named `corrected_tl` in code; the grader input and output carry `skill`; the reactor returns JSON `{character_tl, coach_eg, advance}` with max 2 attempts. Both are internal modules in `ai-agent-talk` (`00` §0, §9).
> - "التقدم والأخطاء في الداتابيز" talks about reusing Langify's `userprogresses` and "مين بيكتب في الداتابيز" splits writes across two repos. Both are superseded: everything is in `ai-agent-talk` with `v2_` collections, and `/api/v2/answers` is the only writer (`00` §0, §8; `01`). The error taxonomy and the classification rules in that section still apply.
> - Flashcard front and back, the deck listing and the four-skill practice screens came later. They live in `00` and `06`.


Oct 18, 2026 · @omar elghandour

## المسار: من الخطة لدرس جاهز

كل يوم بيتولّد بطلب واحد لـ Claude، وبعده الكود بيكمّل الباقي. **Claude مبيكتبش برومبت صور.** هو بيكتب مواصفات الصورة في حقول ثابتة، والكود هو اللي بيركّب البرومبت. كده الستايل مستحيل يتغير من يوم لليوم اللي بعده.

1. **تجهيز ملف اليوم (كود):** الكود بياخد من الخطة الموقف والهدف والقاعدة والكلمات الجديدة والكلمات اللي هتتكرر. وبيضيف عليهم قائمة مفاتيح الصور الموجودة قبل كده.
2. **التوليد (Claude):** Claude بيرجّع اليوم كامل في الهيكل الثابت: النصوص والكويزات والدردشة ومواصفات الصور. الرد بيبقى structured output، يعني مستحيل يرجع شكل غلط.
3. **التحقق (كود، مش موديل):** الكود بيعمل فحوصات ثابتة. لو صفحة فشلت، بتتولّد هي بس تاني مرة واحدة. لو فشلت تاني، بتروح لطابور المراجعة اليدوية.
4. **الصور (OpenAI):** لكل مفتاح صورة جديد، الكود بيركّب الستايل والشخصية والمواصفات، ويبعتهم مع صورة المرجع. لو المفتاح موجود قبل كده، مفيش توليد ولا تكلفة.
5. **فحص الصورة:** موديل رؤية رخيص بيرد بنعم أو لا: فيها كلام مكتوب؟ عدد الأشخاص صح؟ الحاجة المطلوبة باينة؟ لو عدّت، بتترفع على Cloudinary.
6. **الصوت والتخزين:** الصوت بيتولّد lazy زي النظام الحالي. واليوم بيتخزن في MongoDB ويظهر في المسار.

اليوم اللي اتولّد مرة مبيتولّدش تاني. كل الأيام بتعدّي على نفس الطريق ده، سواء اتولّدت مسبقًا أو on-demand.

## هيكل اليوم

يوم الدرس العادي فيه 6 صفحات بترتيب ثابت، وكل صفحة ماشية على قالب من قوالب الكتاب. وكمان كل صفحة من التلات الأولانيين معاها كويز صغير من 3 أسئلة، وده اللي بيظهر لما المستخدم يدوس «اختبرني».

### حقول اليوم

| الحقل | المعنى | مثال |
| --- | --- | --- |
| day · phase · week | رقم اليوم ومرحلته وأسبوعه | 3 · 1 · 1 |
| kind | نوع اليوم | lesson / story / review / test |
| situation\_pt · situation\_ar | اسم الموقف باللغتين | No Supermercado · في السوبرماركت |
| can\_do | المستخدم هيعرف يعمل إيه في آخر اليوم | تشتري أكل وتسأل على السعر وتدفع |
| grammar\_focus | القاعدة الوحيدة الجديدة | articles.definite |
| new\_items | الكلمات والجمل الجديدة (ids) | food.bread, phrase.quanto\_custa |
| recycled\_items | حاجات من آخر 3 أيام لازم تتكرر (ids) | phrase.queria, phrase.obrigado |
| cover\_image | مفتاح صورة غلاف اليوم | scene.supermarket |
| pages | الصفحات بالترتيب، ومعاهم micro (وحدات الميكرو التلاتة) | (جدول تحت) |

### صفحات يوم الدرس

| # | الصفحة | قالب الكتاب | المدة | المحتوى |
| --- | --- | --- | --- | --- |
| 1 | جمل اليوم | Essential Phrases | 2 د | 6 جمل بأيقونات + ملحوظة |
| 2 | القاعدة | Mini Grammar | 2 د | قاعدة واحدة + أمثلة + استثناءات |
| 3 | القاموس | Picture flashcards / Category | 3 د | 8–12 كلمة بصور + لعبة لاقي الصورة |
| 4 | اختبر نفسك | — | 1 د | 6 أسئلة متنوعة على اليوم كله |
| 5 | الدردشة | — | 2 د | موقف مع شخصية، فيه من 2 لـ 3 أهداف |
| 6 | نهاية اليوم | — | 1 د | 3 سطور «اتعلمت النهارده» |

### أنواع الأيام التانية

- **يوم القصة** (7، 14، 21، 28، وهكذا): فيه 4 لوحات وفي كل لوحة جملتين. بعدهم أسئلة فهم، وبعدين كلمات القصة، وبعدين نهاية اليوم. القصة مفيهاش غير حاجات المستخدم اتعلمها، وممكن تزيد عليهم 3 كلمات جديدة بحد أقصى، وكل واحدة معاها شرح جوه الجملة.
- **يوم المراجعة** (59–60): Claude مبيتدخلش فيه. المحتوى بيتبني من نظام الـ SRS الموجود عندك.
- **يوم الاختبار** (30، 90): الأسئلة بتتسحب من كويزات الأيام اللي فاتت، من غير محتوى جديد.

حاجات زي «هتراجعها بكره» والـ streak بيحسبها الكود من أداء المستخدم، مش Claude.

## شكل الصفحة: البوستر اللي بيتبني قدامك

كل صفحة في الدرس شكلها زي صفحة الكتاب بالظبط، بس بتتبني خطوة خطوة في مكانها. النموذج الأول موجود هنا: [SER ou ESTAR](https://claude.ai/artifact/BvShJcvj41hdminvgBLQbf).

1. الصفحة بتظهر من الأول بشكلها الكامل كـ **خطوط باهتة**، زي صفحة تلوين. المستخدم شايف هو رايح فين.
2. المستخدم بيدوس ⮞ مرة واحدة، والصفحة بتشتغل لوحدها زي درس متسجّل. سطر إنِس بيظهر كترجمة مكتوبة تحت، وفي الأبلكيشن الحقيقي يتقرا بصوت مصري.
3. كل بلوك بيظهر في مكانه وبيتقرا بالصوت، والصفحة بتنزل لوحدها للبلوك الجاي. وتحت في شريط فصول (SER، ESTAR، الصعب، القاعدة)، ومعاه إيقاف وسرعة. المستخدم يقدر ينط لأي فصل بضغطة.
4. كل 3 أو 4 خطوات، الخطوة بتبقى **سؤال قبل الكشف**، زي «Estou em casa: SER ولا ESTAR؟». الصفحة بتقف هنا بس. لو غلط، بياخد تلميح ويجرب تاني، ولو صح الصفحة بتكمّل لوحدها. يعني الضغطات بتبقى على الأسئلة بس.
5. في الآخر الصفحة بتبقى البوستر الكامل، وبتتحفظ في المكتبة. وبيظهر زرارين «غطّي» و«اسمع الصفحة».

اللي راجع يراجع الصفحة بيدوس «اعرض الصفحة كلها» ويتخطى الخطوات.

### الحقول اللي بتتضاف لكل صفحة

| الحقل | المعنى |
| --- | --- |
| blocks | أجزاء البوستر بـ ids: عنوان عمود، صف، كارت، زوج vs، بوكس القاعدة |
| steps | ترتيب الكشف، من 12 لـ 20 خطوة |
| step.block | البلوك اللي هيظهر |
| step.kind | reveal أو ask |
| step.tip\_ar | سطر الفقاعة، 15 كلمة بالكتير، بالعامية |
| step.question\_ar · options · answer | للـ ask بس |
| step.why\_ar · hint\_ar | سطر لما يجاوب صح، وسطر لما يغلط |

قواعد الخطوات: مفيش ask في أول 3 خطوات، وفي ask واحد على الأقل كل 4 خطوات. والـ ask بيبقى على حاجة المستخدم يقدر يستنتجها من اللي ظهر قبلها.

**في React Native:** كل بلوك بيترسم بنفس الـ component بحالتين: ghost وshown. الفقاعة View متموضعة من onLayout بتاع البلوك، والـ ScrollView بينزل للبلوك الجاي لوحده.

## العناصر المشتركة

أي صفحة بتتبني من عنصرين بس: **الجملة** و**الكلمة**. العنصر بيتكتب مرة واحدة ويتخزن بـ id ثابت. الكويزات والدردشة والمراجعة بتشاور عليه بالـ id، من غير ما تنسخ النص تاني.

### الجملة (phrase)

| الحقل | المعنى | مثال |
| --- | --- | --- |
| id | اسم الفكرة مش النص، عشان ينفع في أي لغة | phrase.ask\_price |
| pt · pt\_f | الجملة، ونسخة المتكلمة لو بتفرق | Obrigado! · Obrigada! |
| ar · ar\_f | المعنى بالفصحى البسيطة، ونسخة المتكلمة | أنا متعب · أنا متعبة |
| say\_ar | النطق بحروف عربي (الجدول تحت) | كوانتو كوشتا |
| ipa | متخبي، بيظهر بضغطة طويلة | /ˈkwɐ̃.tu ˈkuʃ.tɐ/ |
| marks | الكلمات اللي بتتلوّن ولونها | Uma → f |
| icon | اسم أيقونة من القائمة المسموحة بس | payments |
| audio\_pt | النص اللي بيتقرا لما يبقى مختلف عن المكتوب | 4,50 € → quatro euros e cinquenta |
| note | ملحوظة قصيرة بالعربي (اختياري) | ألطف من Quero |

### الكلمة (word)

| الحقل | المعنى | مثال |
| --- | --- | --- |
| id | مفتاح الفكرة، وهو نفسه مفتاح الصورة | food.cheese |
| pt · lemma | الكلمة بأداة التعريف، والكلمة من غيرها | o queijo · queijo |
| gender · plural | m / f / none، والجمع | m · os queijos |
| ar · say\_ar · ipa | المعنى والنطق | الجُبن · أو كايچو |
| pos · rank | نوع الكلمة، وترتيبها في قائمة الـ 1000 | noun · 412 |
| example | جملة قصيرة فيها كلمات معروفة بس، باللغتين | Queria o queijo, por favor |
| image\_spec | مواصفات الصورة، وبتتكتب لو المفتاح جديد بس | (قسم الصور) |

### النطق بحروف عربي (اقتراح محتاج موافقتك)

محتاجين قاعدة واحدة تمشي عليها كل الدروس. لو مفيش قاعدة، Claude هيكتب نفس الكلمة بأكتر من طريقة. الحروف دي متظبطة على نطق شبونة وعلى طريقة قراية المصريين.

| الصوت | بيتكتب | مثال |
| --- | --- | --- |
| g | ج (الجيم المصري) | obrigado ← أوبريجادو |
| j، و g قبل e/i | چ (زي چاكيت) | queijo ← كايچو |
| ch، x، و s في آخر المقطع | ش | custa ← كوشتا |
| r في أول الكلمة، و rr | غ | rua ← غوا |
| r في النص | ر | caro ← كارو |
| v · p | ڤ · پ | vinho ← ڤينيو |
| lh · nh | لي · ني | trabalho ← تراباليو |
| الحروف اللي بتتنطق من المنخير (ão، ã، em) | ن خفيفة في الآخر | não ← ناون |
| e في آخر الكلمة | بتتشال (بتتنطق خفيفة جدًا) | leite ← لايت |
| o في آخر الكلمة | و | pouco ← پوكو |

### مفتاح الصورة والأيقونة

- **مفتاح الصورة** هو اسم الفكرة بالإنجليزي، مش الكلمة البرتغالي: food.bread، verb.go، emotion.tired، place.pharmacy، scene.supermarket.checkout، story.s01.p2. المفتاح بياخد صورة واحدة بس وتفضل معاه. ولما تضيف الإنجليزي والألماني بعدين، هتستخدم نفس الصور.
- الكلمات والمشاهد والقصص بتاخد **صورة**. الجمل بتاخد **أيقونة** بس، من قائمة ثابتة فيها حوالي 150 اسم من Material Symbols. Claude بيختار من القائمة دي بس ومبيخترعش أيقونات.
- **ألوان الـ marks:** m أزرق، و f كورال، و verb أخضر، و prep برتقالي، و pron بنفسجي. اللون مبيتغيرش في أي صفحة.

## حقول كل نوع صفحة

كل صفحة معاها type ثابت، وكل نوع ليه حقول ثابتة وعدد ثابت. أي صفحة من دول بتترسم بـ component واحد في React Native، زي الشاشات اللي عملناها في Stitch.

### 1. phrases (جمل اليوم)

- title\_pt · title\_ar: زي NO CAFÉ · في الكافيه.
- phrases: **6 جمل بالظبط**، مترتبين زي ما بيحصلوا في الموقف الحقيقي (تحية ← طلب ← حساب ← شكر).
- tip: ملحوظة بالعربي فيها جملتين بحد أقصى، والبرتغالي اللي جواها متعلّم عليه عشان يتكتب LTR. الملحوظة لازم تبقى ثقافة أو استخدام حقيقي، زي «um café = إسبريسو».
- quiz: 3 أسئلة.

### 2. rule (القاعدة)

- rule\_id · title\_pt · title\_ar: زي O ou A? · مذكر ولا مؤنث؟
- explain\_ar: جملتين بحد أقصى.
- layout: واحد من 3 أشكال:
  - **two\_columns** (o/a، ser/estar): كل عمود فيه عنوان باللغتين، ولون، و3 أمثلة، وسطر «قاعدة سريعة».
  - **table** (تصريف الأفعال): 5 صفوف للضمائر (eu، tu، ele/ela، nós، eles/elas)، وكل خانة فيها البرتغالي والنطق. كل صف معاه رسمة شخصية صغيرة ثابتة للضمير ده، زي ما في صفحات Fundamentals في الكتاب. وتحت الجدول شريط فيه 4 أمثلة بصور، وبعدهم بوكس «القاعدة المهمة».
  - **pattern** (تركيبة جملة): التركيبة نفسها، زي «Queria + حاجة + por favor»، ومعاها 4 أمثلة.
- exceptions: من 0 لـ 2.
- why\_ar: سطر واحد بيقول المستخدم يستنتج القاعدة إزاي لوحده.
- quiz: 3 أسئلة.

### 3. dictionary (القاموس)

- title\_pt · title\_ar: زي A COMIDA · الأكل.
- words: **من 8 لـ 12 كلمة**، وكلهم من نفس الفئة.
- لعبة «لاقي الصورة» الكود بيبنيها من الكلمات دي، وClaude مبيكتبهاش.
- quiz: 3 أسئلة.

### 4. self\_test (اختبر نفسك)

- items: **6 أسئلة** على اليوم كله. لازم يبقى فيهم سؤال استماع على الأقل، وسؤال على القاعدة، وسؤال فيه تركيب جملة (build).

### 5. chat (الدردشة)

- character\_id · setting\_ar · mission\_ar: زي rita · الكاشير · «ادفع واسأل لو بياخدوا كارت».
- goals: من 2 لـ 3 أهداف، وكل هدف مربوط بجملة من جمل اليوم.
- beats: من 4 لـ 6 مراحل. كل مرحلة فيها:
  - جملة الشخصية: pt، وar، وsay\_ar.
  - المستخدم المفروض يقول إيه، مشروحة بالعربي.
  - الإجابات المقبولة بالبرتغالي.
  - 3 ردود مقترحة، وواحد فيهم هو المطلوب.
  - تلميح بالعربي.
- الرد الطبيعي على كلام المستخدم، سواء تصحيح أو تشجيع، بيكتبه الـ agent لايف ومش متولّد مسبقًا. وده نفس المبدأ اللي ماشي بيه في مشروع الـ agent.

### 6. done (نهاية اليوم)

- learned\_ar: 3 سطور قصيرة، زي «12 كلمة أكل». الباقي بيحسبه الكود.

### story (يوم القصة)

- story\_id · title\_pt · title\_ar.
- panels: **4 لوحات**. كل لوحة ليها مفتاح صورة وimage\_spec وجملتين. كل جملة فيها: speaker، وpt، وar، وsay\_ar، وgloss للكلمات الجديدة (زي شرح Chiado جوه الجملة).
- questions: 4 أسئلة فهم.
- tip: ملحوظة واحدة.

### أنواع الأسئلة

| type | المستخدم بيشوف | بيختار من |
| --- | --- | --- |
| listen\_meaning | صوت جملة أو كلمة | 4 معاني بالعربي |
| listen\_picture | صوت كلمة | 4 صور من نفس الفئة |
| read\_meaning | نص برتغالي | 4 معاني بالعربي |
| meaning\_to\_pt | معنى بالعربي | 4 جمل بالبرتغالي |
| article | كلمة من غير أداة تعريف | o / a |
| gap | جملة فيها فراغ | 3–4 كلمات |
| build | معنى بالعربي | كلمات برتغالي يرتبها، ومعاهم كلمة زيادة غلط |

كل سؤال فيه الحقول دي: type، وtests (الـ ids اللي بيختبرها)، والسؤال، والاختيارات، وanswer. ومعاهم feedback\_ar، وهو سطر واحد لما الإجابة تبقى صح، وwhy\_wrong\_ar، وهو سطر لكل اختيار غلط. الاختيارات الغلط بتبقى من نفس اليوم أو نفس الفئة، وطولها قريب من طول الإجابة. والـ UI مبيظهرش ترجمة أي اختيار قبل ما المستخدم يجاوب.

## الفلاش كاردز (كلمات وجمل)

الكروت مش محتاجة محتوى جديد. أي كلمة أو جملة بتتولّد في اليوم بتتحوّل لكارت لوحدها، وClaude بيزوّد حقلين بس للجمل. والجدولة بتمشي على نظام الـ SRS اللي عندك أصلًا.

### الكارت بيدخل إمتى

- العنصر بيدخل الـ deck لما المستخدم يخلّص الصفحة اللي فيها العنصر ده.
- مراجعة اليوم فيها 15 كارت بالكتير، يعني حوالي 3 دقايق. الرقم ده شامل الجديد والمراجعة، والتفاصيل في «عشان الكروت متغرقش المستخدم».
- الـ decks بتتعمل لوحدها:
  - deck لكل موقف (الكافيه، السوبرماركت، المواصلات).
  - deck اسمه «اللي بتغلط فيه»، فيه أي عنصر المستخدم غلط فيه في كويز أو دردشة.

### أنواع الكروت

| النوع | الوش | الضهر | كلمات | جمل |
| --- | --- | --- | --- | --- |
| recognize | البرتغالي + الصوت | المعنى + النطق + المثال | آه | آه |
| picture | الصورة | o queijo + الصوت | آه | لأ |
| listen | الصوت بس | البرتغالي + المعنى | آه | آه |
| produce | المعنى + الموقف | البرتغالي + الصوت | آه | آه |
| cloze | الجملة ناقصها كلمة + الموقف | الكلمة الناقصة + الجملة كاملة | لأ | آه |

الكارت بيبتدي بـ recognize أو picture. بعد مرتين صح ورا بعض بيبقى listen، وبعدين produce أو cloze. يعني المستخدم بيبدأ يتعرّف على الكلمة وبعدين يبقى يقولها بنفسه. الكود هو اللي بيختار نوع الكارت، مش Claude. والتقييم 3 زراير: تاني · صعبة · سهلة.

### عشان الكروت متغرقش المستخدم

الكروت بتمشي مع آخر دروس المستخدم. كلمة زي Olá بتطلع من المراجعة اليومية خلال أسبوع أو اتنين، لأن المستخدم بيستخدمها صح كل يوم جوه الدروس والدردشة.

1. **سقف ثابت:** المراجعة فيها 15 كارت في اليوم بالكتير، حتى لو المستحق أكتر. وفي آخرها زرار «عايز أكتر» للي عايز.
2. **الأولوية للحديث:** الـ 15 كارت بيتقسموا كده:
   - 9 من آخر 7 أيام.
   - 4 من الحاجات اللي غلط فيها قريب.
   - 2 من أي حاجة أقدم جه معادها. لو جزء مافيهوش كروت كفاية، باقي نصيبه بيروح للجزء اللي قبله.
3. **الاستخدام جوه الدرس بيتحسب مراجعة:** لو المستخدم قال أو اختار العنصر صح في كويز أو دردشة أو «احكي يومك»، الكارت بيتحدّث كأنه اتراجع بتقييم «سهلة». ولو غلط فيه، الكارت بيرجع لأول المراجعة وياخد أولوية. ده أهم قاعدة، لأن الدروس بتكرّر الحاجات الأساسية لوحدها.
4. **التخرّج:** الكارت بيتخرّج ويبقى mastered لما الـ interval يوصل 21 يوم، والمستخدم يكون قاله صح في موقفين مختلفين. الكارت المتخرّج مبيظهرش في المراجعة اليومية. بيرجع بس لو المستخدم غلط فيه في حتة تانية، أو لو طلع في فحص الشهر، وده بيبقى كارتين بس.
5. **زرار «عارفها»:** بيظهر في أول مرة يشوف فيها المستخدم الكارت. لو داس عليه، بيظهر له سؤال إنتاج واحد على العنصر. لو جاوبه صح، الكارت بيتخرّج على طول.
6. **مفيش كوم متراكم:** لو المستخدم غاب أسبوع، مش هيرجع يلاقي 120 كارت. المراجعة بتاخد أهم 15 بس، والباقي بيتوزّع على الأيام الجاية. ومش هيظهر له رقم المتراكم خالص.
7. **مش كل حاجة كارت:** كلمات الربط (o، a، de، e) ملهاش كروت. وكل عنصر ليه كارت واحد بس، وشه بيتغيّر مع المستوى. المهارات التانية مكانها بنك الأسئلة، مش الكروت.

**مثال Olá:** المستخدم اتعلمها يوم 1، وراجعها يوم 2. بعد كده قالها صح في دردشة يوم 3، وفي «احكي يومك» يوم 5، وفي دردشة يوم 8. فالـ interval بيكبر لوحده. يوم 15 مش هتظهر في المراجعة غير لو المستخدم غلط فيها.

**في الداتابيز:** كل ده ماشي على flashcardProgress الموجودة. التخرّج هو masteryLevel: mastered، وهو موجود أصلًا. الناقص حقلين بس:

- introducedDay: اليوم اللي العنصر اتعلّم فيه، عشان نعرف هو من آخر 7 أيام ولا لأ.
- usedCorrectlyIn: المواقف اللي قاله فيها صح، عشان شرط التخرّج.

### الحقول الزيادة للجملة

| الحقل | المعنى | مثال |
| --- | --- | --- |
| context\_ar | بتقولها إمتى، في سطر واحد بالعامية | الكاشير سألك عايز حاجة تانية وإنت خلّصت |
| cloze | الكلمة المهمة اللي هتتشال من الجملة | Quanto \_\_\_? ← custa |

الكلمة مش محتاجة حقول زيادة، لأن الصورة والمثال موجودين فيها أصلًا.

## الميكرو ليرننج (اللي بيرجّع المستخدم كل يوم)

الميكرو بيرجّع المستخدم للأبلكيشن 3 مرات في اليوم، وكل مرة من دقيقة لدقيقتين. مش محتوى منفصل عن الدرس: كل وحدة مبنية على يوم الدرس، والوحدات مربوطة ببعض في سلاسل. وده تطوير لـ Micro Learn اللي عندك في Langify، وماشي على نفس الفكرة: الترتيب حسب الاستخدام اليومي، والمستخدم بيستنتج القاعدة بنفسه.

### اليوم الواحد: 3 وحدات

| الوقت | الوحدة | المدة | فيها إيه | الإشعار |
| --- | --- | --- | --- | --- |
| الصبح | جملة النهارده | 1 د | جملة واحدة من اليوم بالصوت، ومعاها مهمة حقيقية: «قولها النهارده في الكافيه» | الجملة نفسها |
| الضهر | أداة | 2 د | 3 أمثلة، والمستخدم بيستنتج القاعدة، وبعدين سؤالين | «الأداة 3 من 5 في اطلب أي حاجة» |
| بالليل | قفّل يومك | 2 د | «عملت المهمة؟»، وبعدها الكروت اللي جه معادها، وبعدين تلميح لبكره | عدد الكروت والـ streak |

المستخدم بيختار المواعيد من الإعدادات. المواعيد الافتراضية 8:30 و1:00 و8:30، ومفيش إشعارات في ساعات النوم.

### السلاسل (الوحدات المترابطة)

وحدة «الأداة» بتبقى جزء من سلسلة فيها من 4 لـ 6 أدوات ورا بعض، وكلهم حوالين حاجة واحدة بنعملها في الحياة. كل أداة بتزوّد حاجة واحدة بس على اللي قبلها.

| السلسلة | الأدوات بالترتيب |
| --- | --- |
| اطلب أي حاجة | Queria + حاجة ← Queria + كمية (dois cafés) ← Queria + فعل (Queria pagar) ← Podia + فعل؟ ← Pode + فعل؟ |
| اسأل عن أي حاجة | Onde é…? ← Quanto…? ← A que horas…? ← Tem…? ← Como…? |
| اتكلم عن امبارح | fui ← comi / bebi ← estive ← fiz ← جملة فيها تلاتة مع بعض |
| ده وده | este ← esse ← aquele ← isto / isso |
| اتكلم عن بكره | vou + فعل ← amanhã vou… ← vamos + فعل |

السلاسل ماشية مع خطة الـ 90 يوم. الأداة لازم تكون اتشرحت في اليوم نفسه أو قبله، وعمرها ما تسبق الدرس. والكود هو اللي بيحدد اليوم ده خطوة كام في أنهي سلسلة.

### حقول الميكرو في اليوم

| الحقل | المعنى | مثال |
| --- | --- | --- |
| morning.phrase · morning.mission\_ar | جملة من اليوم، ومهمة حقيقية | phrase.ask\_price · اسأل على سعر حاجة واحدة النهارده |
| tool.series · tool.step | السلسلة والخطوة (الكود بيبعتهم) | order\_anything · 2 من 5 |
| tool.builds\_on\_ar | الأداة دي بتبني على إيه | امبارح اتعلمت Queria + حاجة، النهارده هنزوّد الكمية |
| tool.examples | 3 جمل فيها الأداة | Queria dois pães · Queria três maçãs · Queria um queijo |
| tool.notice | سؤال «لاحظت إيه؟» ومعاه 3 اختيارات | الكلمة بتاخد s في الآخر لما تبقى أكتر من واحدة |
| tool.rule\_ar | القاعدة، وبتظهر بعد ما يجاوب | الجمع = الكلمة + s |
| tool.drills | سؤالين من أنواع الأسئلة | gap · build |
| evening.teaser\_ar | تلميح لدرس بكره في سطر | بكره هتعرف تفهم السعر لما الكاشير يقوله |

### إيه اللي بيرجّع المستخدم

- **المهمة الحقيقية:** الصبح المستخدم بياخد مهمة، وبالليل بيتسأل «عملتها؟». لو قال آه، بياخد بادج للموقف ده.
- **السلسلة الناقصة:** رسالة زي «فاضل أداتين وتعرف تطلب أي حاجة في البرتغال».
- **الكروت اللي جه معادها:** عددها بيظهر في إشعار بالليل.
- **streak مرن:** يوم واحد إجازة في الأسبوع من غير ما الـ streak يضيع.

الحاجات دي كلها الكود بيحسبها. Claude بيكتب محتوى الوحدات بس.

## الاستخدام اليومي ومعرفة النواقص

المستخدم ممكن يفهم الكلمة وميعرفش يقولها، والفرق ده هو الناقص الحقيقي. عشان كده الأبلكيشن بيحسب لكل كلمة وجملة **أربع درجات**، مش درجة واحدة: سمعها، وفهمها، وقالها، واستخدمها في الشارع. وكل حاجة المستخدم بيعملها في اليوم بتزقّه من «فهمها» لـ «قالها».

### الرقم اللي بيشوفه كل يوم

في أول الشاشة الرئيسية بيظهر رقمين جنب بعض: **«بتفهم 180 · بتقول 64»**. المسافة بين الرقمين هي النواقص، وهدف كل يوم إنها تقل. وده من الـ selling points، لأن معظم الأبلكيشنات بتعدّ الكلمات اللي المستخدم شافها بس.

### الدرجات الأربعة

| الدرجة | بتتحسب لما | منين |
| --- | --- | --- |
| سمعها | يجاوب صح في سؤال أو كارت استماع مرتين | listen\_meaning، listen\_picture، كارت listen |
| فهمها | يجاوب صح في سؤال معنى مرتين | read\_meaning، كارت recognize |
| قالها | يقولها أو يكتبها صح من غير ما تبقى قدامه، في موقفين مختلفين | الدردشة، و«احكي يومك»، وكارت produce أو cloze، وسؤال build |
| استخدمها | يقول آه على «عملت المهمة؟» | مهمة الميكرو |

الكلمة اللي اتقالت بس من غير ما تتراجع من 14 يوم بتنزل درجة. يعني الرقم بيفضل صادق.

### «احكي يومك»: الاستخدام اليومي

دي أهم وحدة في الأبلكيشن، وبتبقى جزء من وحدة الليل في الميكرو. المستخدم بيتكلم عن حياته هو، مش عن ياسين.

1. بيظهر له سؤالين أو تلاتة بالعربي عن يومه، زي «اشتريت إيه النهارده؟» و«شربت إيه الصبح؟».
2. بيجاوب بالبرتغالي، بالصوت أو بالكتابة. ولو وقف، بيظهر له بنك كلمات من الحاجات اللي اتعلمها بس.
3. الـ agent بيرد بجملة طبيعية، وبيصحّح لو في غلط، وبيديه النسخة الصح بصوت.
4. في الآخر بيظهر ملخص: «قلت 7 كلمات صح، وكلمتين جداد دخلوا في بتقولها».

الأسئلة بتميل للحاجات اللي المستخدم فهمها ولسه ماقالهاش. يعني الكود بيختار السؤال اللي بيقفل أكبر ناقص.

### تصنيف الغلط

أي غلطة، في كويز أو دردشة أو «احكي يومك»، بتتسجّل بالعنصر والقاعدة ونوع الغلط. التصنيف نفسه على مستويين، وتفاصيله في قسم «التقدم والأخطاء في الداتابيز» تحت.

### شاشة «نواقصك»

الشاشة دي بتعرض المواقف نفسها، مش نسبة مئوية. كل موقف معاه الحاجات اللي المستخدم يقدر يعملها فيه:

| الموقف | تقدر تعمل إيه | الحالة |
| --- | --- | --- |
| الكافيه | تطلب قهوة | بتقولها |
| الكافيه | تسأل عن الحساب | بتفهمها بس |
| السوبرماركت | تدفع بالكارت | لسه |

جنب المواقف بيظهر أكتر 3 أنواع غلط المستخدم بيقع فيهم، زي «o و a بتتلخبط معاك في الأكل». وجنب كل ناقص فيه زرار **«صلّحها في دقيقتين»**. الزرار بيبني تمرين من الأسئلة والكروت الموجودة أصلًا، فمش بيكلّف توليد جديد.

### اختبار الموقف كل أسبوع

مع قصة آخر الأسبوع فيه دردشة تانية، بس من غير ردود مقترحة ولا تلميحات. الدردشة دي بتختبر كل الحاجات اللي المستخدم اتعلّم يعملها في الأسبوع. نتيجتها بتحدّث شاشة النواقص، وأي حاجة المستخدم ماعرفش يعملها بتدخل ميكرو الأسبوع اللي بعده.

### اللي Claude بيزوّده في توليد اليوم

- **speak\_prompts:** من 3 لـ 4 أسئلة عن حياة المستخدم. السؤال نفسه بالعامية، ومعاه إجابة نموذجية بالبرتغالي، والـ ids اللي الإجابة بتستخدمها.
- **can\_do list:** من 2 لـ 3 حاجات المستخدم هيعرف يعملها في اليوم ده، زي «تدفع بالكارت». كل حاجة مربوطة بالجمل اللي بتثبتها، ومن القائمة دي بتتبني شاشة النواقص.

## بنك الأسئلة والمراجعة لكل مستخدم

كل درس بيبني بنك أسئلة بيغطي المهارات الأربعة: قراية، وسماع، وكتابة، وكلام. وكل مستخدم بياخد خلطة خاصة بيه من البنك، حسب اللي درسه ومستواه. الجدولة بتشتغل زي الـ SRS، بس **على العنصر × المهارة، مش على السؤال**.

### ليه الجدولة على العنصر مش السؤال

لو السؤال نفسه اللي اتجدول، المستخدم هيحفظ السؤال ومش هيحفظ المعلومة. عشان كده كل عنصر ليه جدول منفصل لكل مهارة، زي food.cheese:listen وfood.cheese:speak. ولما ميعاد واحد منهم ييجي، الكود بيختار سؤال من البنك بيختبر العنصر ده بالمهارة دي، والمستخدم مشافهوش قريب.

### البنك نصه من الكود ونصه من Claude

| المصدر | الأسئلة | العدد |
| --- | --- | --- |
| الكود، من بيانات العنصر | اسمع واختار الصورة، o ولا a، اقرا واختار المعنى، كمّل من الـ cloze، قول الجملة من معناها | مفيش حد، وبدون تكلفة |
| Claude، مع توليد اليوم | جملة جديدة فيها فراغ في سياق مختلف، سؤال فهم على حوار قصير، اكتب رد على موقف، اتكلم عن حياتك | من 10 لـ 15 في اليوم |

أي سؤال في البنك فيه الحقول دي: skill (المهارة)، وtests (ids العناصر)، وtool\_id (القاعدة)، والسؤال، وaccepted (قائمة الإجابات المقبولة)، وlevel (أقل مستوى ينفع يظهر فيه). والأسئلة الحرة بدل accepted بيبقى فيها criterion: الإجابة المفروض تعمل إيه.

### خلطة الجلسة (10 لـ 12 سؤال)

- 40% حاجات جه معاد مراجعتها.
- 30% نواقص، من أنواع الغلط المتسجّلة.
- 20% من درس النهارده.
- 10% تحدي إنتاج.

المستوى بيتحكّم في النسبة بين التعرّف والإنتاج. المبتدئ بيبدأ 70% قراية وسماع و30% كتابة وكلام، والنسبة بتقلب مع الوقت. ومفيش سؤالين على نفس العنصر ورا بعض. وفي زرار «مش قادر أتكلم دلوقتي» بيشيل أسئلة الكلام من غير عقاب.

### التحقق على طبقات

| المهارة | التحقق | LLM؟ |
| --- | --- | --- |
| قراية وسماع | مقارنة الاختيار باللي متخزّن | لأ |
| كتابة | تنضيف الإجابة (الحروف الكبيرة، المسافات، التشكيل)، وبعدين مقارنتها بـ accepted. فرق التشكيل بس = صح مع ملحوظة | لو مش في القائمة بس |
| كلام | Azure pt-PT بيحوّل الصوت لنص، وبعدين نفس فحص الكتابة بتسامح أكتر | لو مش في القائمة بس |
| إجابة حرة | الـ agent (المصحّح) | آه |

### جودة البنك

- نسبة النجاح لكل سؤال بتتسجّل. أي سؤال نسبته أقل من 20% أو أكتر من 98% بعد 50 محاولة بيتشال لوحده للمراجعة.
- في زرار «السؤال ده فيه مشكلة».
- شوف الأول لو Pronunciation Assessment في Azure بيدعم pt-PT. لو مش بيدعمه، اكتفي بإن الكلام يتحوّل لنص صح، ومتقيّمش النطق نفسه في الأول.

## التقدم والأخطاء في الداتابيز

مش هنعمل collection جديدة. أغلب اللي محتاجينه موجود أصلًا في userprogresses بتاعة Langify، والناقص شوية حقول بس.

### اللي هيتاخد من userprogresses

| الحقل الموجود | هيستخدم في |
| --- | --- |
| flashcardProgress | الـ SRS بتاع العنصر × المهارة. cardId يبقى food.cheese:listen، وdeckId يبقى اليوم أو الموقف. والتخرّج هو masteryLevel: mastered |
| sentenceProgress.errorTypes | المستوى الأول من تصنيف الغلط |
| adaptiveLearning.weakAreas | الأدوات اللي اتحسبت نقطة ضعف، زي articles.definite |
| practice\_weakness · weakSpeakingSentences | بتوع Micro Learn، وهيتدمجوا في النظام ده |

الحقول الجديدة: introducedDay وusedCorrectlyIn جوه الكارت، وscope وitemId وtoolId جوه الغلطة.

### مين بيكتب في الداتابيز

- **Langify** هو صاحب الحالة. الـ validation endpoint بيبقى فيه، وهو اللي بيحدّث userprogresses.
- **Ai-pt-agent** بيبقى مصحّح من غير حالة (stateless). Langify بيبعتله الإجابة الحرة، وهو بيرجّع الحكم والغلطات بس، ومبيكتبش حاجة. كده قاعدة AGENTS.md إن الـ agent مبيكتبش في collections بتاعة Langify مش هتتكسر.

### تصنيف الغلط على مستويين

| المستوى الأول | scope | المعنى |
| --- | --- | --- |
| grammar | verb\_form | تصريف فعل غلط |
| grammar | agreement | o/a، أو صفة مش متوافقة في المذكر والمؤنث أو المفرد والجمع |
| grammar | sentence\_structure | تكوين أو ترتيب الجملة غلط |
| grammar | preposition | حرف جر أو دمج غلط، زي em + o = no |
| vocabulary | forgot\_word | الكلمة ناقصة أو قالها بالعربي |
| vocabulary | wrong\_word | قال كلمة تانية غير المطلوبة |
| vocabulary | brazilian | استخدم الكلمة البرازيلية |
| spelling | accent | الغلط في التشكيل بس، وده بيتحسب «قريب» مش غلط |
| spelling | spelling | الكلمة مكتوبة غلط |
| pronunciation | sound | صوت معيّن غلط |

مع كل غلطة بيتسجّل itemId وtoolId، والجزء الغلط والجزء الصح، وسطر شرح بالعامية.

### مين بيصنّف الغلط

1. **الكود الأول:** الفرق في التشكيل بس ← accent. كلمة ناقصة عن الإجابة المتوقعة ← forgot\_word. o مكان a في كلمة جنسها معروف ← agreement. كلمة من قائمة البرازيلي ← brazilian.
2. **اللي يفضل بس يروح للـ LLM.** بيرجّع structured output من القائمة المقفولة. ولو مش متأكد بيرجّع unclear، والحالة دي متتحسبش نقطة ضعف.

**إمتى حاجة تتحسب نقطة ضعف:** 3 غلطات من نفس الـ scope في نفس الأداة، في آخر 10 محاولات. ساعتها الأداة بتدخل weakAreas، وبتاخد نسبة أكبر في خلطة الأسئلة.

**خد بالك:** flashcardProgress دي array جوه document واحد لكل مستخدم، وهتوصل لحوالي 6,500 صف في 90 يوم. ده لسه بعيد عن حد الـ 16MB، بس كل تحديث بيعيد كتابة الـ array كلها. ابدأ بيها كده، ولو البطء ظهر انقل الكروت لـ collection لوحدها.

## برومبت الـ agent في الـ practice

Prompt 4 الحالي بيعمل حاجتين في نفس الرد: بيحكم وبيرد. لما الـ VERDICT بيبقى سطر مستخبي جوه رد بيتبعت بالـ streaming، ده أضعف جزء، لأن لو السطر اتكتب غلط الكود مش هيفهمه. التصميم الجديد بيفصلهم لـ **مصحّح** بيرجّع JSON بـ schema، و**ممثّل** بيكتب الرد بالـ tags اللي عندك. الممثّل بياخد الحكم جاهز دايمًا، ومبيقررش حاجة.

### الدورة في كل رد

1. **الكود يحكم الأول:** المقارنة بـ accepted، والتنضيف، والـ slot patterns، زي ما هو شغال دلوقتي.
2. **لو الكود مقدرش يحكم:** المصحّح بيرجّع JSON. موديل سريع، من غير streaming.
3. **Langify يسجّل:** العناصر اللي اتقالت صح والغلطات بتدخل userprogresses.
4. **الممثّل يرد:** بياخد الحكم وأهم غلطة، وبيكتب رد الشخصية أو الـ coach، بالـ streaming.
5. **الأبلكيشن يبعت الجملة الجاية.**

### الـ modes

| mode | فين | الممثّل |
| --- | --- | --- |
| practice | دردشة اليوم ومراحلها | الشخصية لو الإجابة صح، والـ coach لو غلط |
| daily | «احكي يومك» | إنِس كصحبة، بترد على اللي قاله، والسؤال الجاي من speak\_prompts |
| open\_question | سؤال كتابة أو كلام حر من البنك | مفيش، والـ UI بيعرض feedback\_ar وcorrected\_pt من المصحّح |
| assessment | دردشة آخر الأسبوع من غير تلميحات | الشخصية بس، ومفيش تصحيح لحد الآخر |

### المصحّح: المدخلات والمخرجات

| المدخل | المعنى |
| --- | --- |
| mode · level · learner\_gender | السياق |
| prompt\_pt | الجملة أو السؤال اللي بيرد عليه |
| accepted أو criterion | الإجابات المقبولة، أو الإجابة المفروض تعمل إيه |
| target\_items · tool\_id · weak\_areas | اللي السؤال بيختبره، ونقاط ضعف المستخدم من userprogresses |
| known\_items | الكلمات المسموح بيها في التصحيح |
| answer · answer\_source | إجابته، وهل كتبها ولا قالها (لو قالها تبقى نص Azure) |

| المخرج | المعنى |
| --- | --- |
| verdict | correct / near\_miss / wrong / off\_topic / arabic\_only / unclear |
| items\_used\_correctly | ids العناصر اللي قالها صح |
| errors | 3 غلطات بالكتير: category، scope، item\_id، tool\_id، wrong، right |
| main\_error | رقم الغلطة اللي هتتصحّح، أو مفيش |
| corrected\_pt | إجابته هو بأقل تعديل، ومحتفظة بكلامه هو |
| feedback\_ar | سطر واحد بالعامية |

الـ schema بيقفل كل القيم الثابتة. أي رد مش ماشي مع الـ schema بيتحسب unclear، ومبيتحسبش غلط على المستخدم.

### برومبت المصحّح

```text
You grade one answer from an Egyptian adult learning European Portuguese (Lisbon). You do not talk to him. Return only the schema.

WHAT COUNTS AS CORRECT
- The answer does what PROMPT asks: it answers the line naturally, or meets CRITERION. Another wording is correct.
- Ignore capital letters, punctuation, a missing accent, "sim"/"não" at the start, and "por favor".
- His own content is always right: his name, city, job, what he bought. Never replace it.
- If ANSWER_SOURCE is speech, the text came from speech recognition: forgive one odd word that sounds like the right one.

VERDICT
- correct: it works.
- near_miss: it works but has one small slip (one wrong ending, o/a, one letter, a Brazilian word).
- wrong: it does not do what PROMPT asks, or has a mistake that changes the meaning.
- off_topic: Portuguese that ignores the prompt.
- arabic_only: no Portuguese at all.
- unclear: you cannot tell what he meant.

ERRORS (max 3, only real ones)
Use only these pairs: grammar/verb_form, grammar/agreement, grammar/sentence_structure, grammar/preposition, vocabulary/forgot_word, vocabulary/wrong_word, vocabulary/brazilian, spelling/spelling, pronunciation/sound. A missing accent is never an error. Link each error to an id from TARGET_ITEMS or KNOWN_ITEMS when one fits.

MAIN_ERROR: the one he should fix now, in this order: an error that changes the meaning, then an error in TOOL_ID, then one in his WEAK_AREAS, then any other.

CORRECTED_PT: his own sentence with the smallest fix, using only KNOWN_ITEMS and TARGET_ITEMS words. Empty when correct.
FEEDBACK_AR: one short Egyptian line about MAIN_ERROR only, with the Portuguese inline. Warm, never "غلط" alone.
```

### الممثّل: اللي بيتغيّر في Prompt 4

- الـ SOURCE بقى دايمًا code، فبلوك «IF SOURCE IS you» وسطر الـ VERDICT المستخبي بيتشالوا خالص. ودالة buildVerdictInstruction مبقاش ليها لزمة.
- بيدخل للممثّل 3 حاجات جداد: MAIN\_ERROR (scope، وwrong ← right، وfeedback\_ar)، وCORRECTED\_PT، وWEAK\_SPOT (لو الغلطة دي من weakAreas).
- بيتضاف mode اسمه daily.

```text
CORRECTION
- Correct only MAIN_ERROR. Never list several mistakes.
- Show CORRECTED_PT once, as the <pt> of the coach block, so he hears his own sentence fixed.
- If WEAK_SPOT is yes, the coach says kindly that this one keeps coming back (e.g. «تاني o و a، عادي دي أكتر حاجة بتتلخبط») and gives the one-line rule.
- unclear from speech: the coach asks him once to say it again, no correction.
- arabic_only: the coach gives the Portuguese for what he said and asks him to try it.

DAILY MODE (احكي يومك)
- You are Inês, his Portuguese friend, chatting in the evening. No story, no scene.
- React in one short Portuguese sentence to what he really did today, then its Egyptian meaning.
- On near_miss or wrong, the coach block comes after Inês, with CORRECTED_PT.
- Do not ask the next question; the app sends it from the day's speak_prompts.
```

باقي Prompt 4 بيفضل زي ما هو: الصوتين، وقواعد اللغة، والـ slot patterns، وشكل الـ tags في المخرج.

## برومبت Claude الثابت (system)

البرومبت ده ثابت في كل الأيام، ومعاه 3 قوائم ثابتة بتتلزق في آخره: الشخصيات، والأيقونات، وكلمات الربط. عشان هو ثابت، اعمله **prompt caching**، وكده مش هتدفع تمنه كامل غير أول مرة. الـ schema نفسه بيتبعت كـ structured output مش جوه البرومبت. والبرومبت بالإنجليزي لأن التعليمات بتبقى أدق بيه.

```text
You are the lesson author for Langify, an app that teaches European Portuguese (as spoken in Lisbon) to Egyptian adults who live in Portugal or are moving there. You write ONE day of a 90-day course and return it only through the provided schema. No commentary.

THE LEARNER
An Egyptian adult in Lisbon who must handle real situations this week: the café, the supermarket, the tram, the pharmacy, the landlord, Finanças. Everything you write must be useful on the street today.

THE FORMAT
Each day is a set of pages from a printed study notebook: phrases, rule, dictionary, self_test, chat, done (or a story day). Write like the best study notebook: short, concrete, visual, no filler.

PORTUGUESE RULES
1. European Portuguese only: comboio, autocarro, elétrico, pequeno-almoço, telemóvel, casa de banho, bilhete, fixe, "estar a + infinitive" for ongoing actions. Never Brazilian forms: ônibus, trem, celular, banheiro, café da manhã, gerund (-ndo) for ongoing actions, "você" as the default "you".
2. Object and reflexive pronouns go after the verb in affirmative sentences: Chamo-me, Dói-me.
3. Polite requests use Queria / Podia and o senhor / a senhora.
4. Use ONLY words from NEW_ITEMS, KNOWN_ITEMS and FUNCTION_WORDS. If a sentence needs any other word, rewrite the sentence.
5. Maximum words per sentence: phase 1 = 7, phase 2 = 10, phase 3 = 14.
6. Every phrase must be something people really say in this situation in Lisbon.

ARABIC RULES (two registers)
1. MEANINGS are in simple Modern Standard Arabic: the ar / ar_f of words, phrases and story sentences, and quiz options that are meanings. Short, common words any Arab reader understands (أريد قهوة، كم السعر؟، شكرًا). No Egyptian words in meanings.
2. EXPLANATIONS are in Egyptian colloquial Arabic, the way people text each other: tip, note, explain_ar, why_ar, quick rules, hints, feedback, mission_ar, setting_ar, learned_ar. عايز not أريد, إزاي not كيف, ليه not لماذا, ده/دي not هذا/هذه, مش not ليس, هـ not سوف.
3. Fixed spellings in explanations: عايز (never عاوز), النهارده, دلوقتي, كده.
4. Translate the meaning, not word by word. If the literal meaning teaches something, put it in "note".
5. Whenever the Portuguese or the Arabic changes with the speaker's gender, fill pt_f and ar_f.

PRONUNCIATION (say_ar)
Write how a Lisbon speaker says it, in Arabic letters, following PRONUNCIATION_TABLE exactly. Put European Portuguese IPA in "ipa".

TEACHING RULES
1. One new rule per day: GRAMMAR_FOCUS. Do not present anything else as a rule.
2. Every item in RECYCLE appears at least once in the day.
3. Every item in NEW_ITEMS appears at least 3 times across the day (its page, a quiz, and the chat or an example).
4. Tips are real Lisbon usage or culture, never generic study advice.
5. Quizzes: exactly one correct answer; wrong options are plausible and come from the same day or category; no joke options.
6. Chat: the character speaks naturally, using only allowed words; every learner turn can be done with today's phrases.

IMAGES
1. Words, scenes, the day cover and story panels need an image key. If EXISTING_IMAGE_KEYS has the same concept, reuse that key and leave image_spec empty.
2. Otherwise create a new key (lowercase English, category.concept, e.g. food.cheese, verb.go, emotion.tired, scene.pharmacy.counter) and fill image_spec.
3. image_spec describes only what is visible, in plain English. One clear subject. No text, letters, numbers or readable signs. Refer to characters only by their id from CHARACTERS. For a verb, show a character in the middle of the action so it is understood without words.
4. Phrases never get images; pick their icon from ICONS only.

FLASHCARDS
For every phrase, also write context_ar (one Egyptian line: when you say it) and cloze (the one key word to hide; it must be a word of that phrase).

MICRO
Write the day's three micro units:
- morning: one phrase from today and mission_ar, a small real task the learner can do today in Lisbon (Egyptian).
- tool: the step given in MICRO_STEP. builds_on_ar links it to the previous step in one Egyptian line. examples = 3 sentences that use the tool and only allowed words. notice = a "what did you notice?" question with 3 options, exactly one correct. rule_ar = the rule in one Egyptian line, shown after the answer. drills = 2 quiz items.
- evening: teaser_ar, one Egyptian line about tomorrow's situation.

PAGE STEPS
Every page is built on screen step by step. Give it blocks (each with an id) and 12-20 steps in reading order. A step reveals one block and has tip_ar: one Egyptian line under 15 words that tells the learner what to notice. About every fourth step is an ask instead: a question the learner can work out from what is already shown, with options, the answer, why_ar and hint_ar. No ask in the first 3 steps.

DAILY USE
- speak_prompts: 3-4 questions about the learner's own real day, in Egyptian (e.g. اشتريت إيه النهارده؟). Each has a model answer in Portuguese using only allowed words, and the ids it uses. Prefer today's items plus RECYCLE.
- can_do: 2-3 things the learner can now do in this situation (Egyptian, e.g. تدفع بالكارت), each linked to the phrase ids that prove it.

CHARACTERS
{{characters}}

ICONS
{{icons}}

FUNCTION_WORDS
{{function_words}}

PRONUNCIATION_TABLE
{{pronunciation_table}}
```

## رسالة الطلب لكل يوم

الرسالة دي الكود بيملاها من الخطة ومن الداتابيز، ومفيهاش ولا حرف بيتكتب بإيد. تحت مثال ليوم 3. النقط معناها قوائم بتكمّل من الداتا.

```text
Write day 3 of 90.

DAY
kind: lesson
phase: 1 · week: 1
situation: No Supermercado · في السوبرماركت
can_do: تشتري أكل وتسأل على السعر وتدفع
grammar_focus: articles.definite — o / a and noun gender (layout: two_columns)
chat_character: rita
dictionary_category: food
MICRO_STEP: order_anything (اطلب أي حاجة) · step 2 of 5 · previous: Queria + thing · today: Queria + quantity (dois pães)
tomorrow: Os Números · الأرقام

NEW_ITEMS
words: o pão, o leite, o queijo, a maçã, a água, a banana, o peixe, o frango, o arroz, o café, o açúcar, a carne
phrases: Quanto custa? · Quanto é? · Aceita cartão? · Queria um saco, por favor · Mais alguma coisa? · Só isto, obrigado

KNOWN_ITEMS
phrase.greet_morning: Bom dia! · phrase.my_name: Chamo-me ... · phrase.order_coffee: Queria um café, por favor · ...

RECYCLE
phrase.order_coffee, phrase.thanks, phrase.greet_morning

EXISTING_IMAGE_KEYS
food.coffee, food.pastel_de_nata, scene.cafe.counter, emotion.happy, ...
```

ملاحظات:

- **يوم القصة** بياخد kind: story، ومعاه story\_outline من الخطة في 3 أو 4 سطور، وmax\_new\_words: 3.
- **KNOWN\_ITEMS** بتكبر مع الوقت، لحد حوالي 600 عنصر في يوم 60. ابعت id والنص البرتغالي بس، من غير ترجمة. كده هتفضل متوسط بضع آلاف tokens.
- **EXISTING\_IMAGE\_KEYS** لما تكبر، ابعت منها الفئات اللي ليها علاقة باليوم بس. مثلًا يوم السوبرماركت ياخد food.\* وscene.\* وemotion.\* وverb.\*.
- الترتيب في قائمة الـ 1000 كلمة مش لازم يتبعت لـ Claude. الكود هو اللي بيختار الكلمات بيه، وبعدين بيحط rank في الداتا.

## التحقق الآلي

التحقق كله فحوصات كود ثابتة، مفيهاش موديل بيراجع. وده ماشي مع قرارك إنك تلغي حلقة المراجعة وإعادة الكتابة. لو صفحة فشلت، بتتولّد هي بس تاني مرة واحدة، ومعاها رسالة الخطأ. لو فشلت تاني، بتروح لطابور المراجعة اليدوية.

| الفحص | بيشيّك على إيه | لو فشل |
| --- | --- | --- |
| الأعداد | 6 جمل، ومن 8 لـ 12 كلمة، و3 أسئلة لكل صفحة، و6 في اختبر نفسك، ومن 4 لـ 6 مراحل في الدردشة | إعادة الصفحة |
| المفردات | أي كلمة برتغالي لازم تبقى في NEW أو KNOWN أو FUNCTION\_WORDS. الكود بيرجّع الكلمة لأصلها الأول، زي queria ← querer | إعادة الصفحة ومعاها الكلمات الغلط |
| طول الجملة | 7 كلمات في المرحلة 1، و10 في 2، و14 في 3 | إعادة الصفحة |
| برتغالي برازيلي | قائمة كلمات ممنوعة (ônibus، trem، celular، banheiro)، وأي فعل آخره -ndo، وvocê في أول الجملة | إعادة الصفحة |
| مستوى العربي | حقول الشرح مفيهاش: أريد، ماذا، لماذا، هذا، هذه، الذي، سوف، ليس، عاوز. وحقول المعنى مفيهاش: عايز، إزاي، ليه، ده، دي، مش | إعادة الصفحة |
| النطق | say\_ar موجود وكله حروف عربي | إعادة العنصر |
| الجنس | أداة التعريف في pt لازم تطابق gender | إعادة العنصر |
| التكرار | كل عنصر في RECYCLE ظهر مرة على الأقل، وكل عنصر جديد ظهر 3 مرات | تحذير بس |
| الأسئلة | الإجابة الصح واحدة وموجودة في الاختيارات، والاختيارات مش متكررة، والـ ids اللي في tests موجودة | إعادة الصفحة |
| الأيقونات | أي icon لازم يبقى من القائمة | أيقونة افتراضية |
| الصور | شكل المفتاح صح، وكل مفتاح جديد معاه image\_spec، والمفتاح الموجود مالوش image\_spec، والشخصيات كلها من CHARACTERS | إعادة العنصر |

فحوصات الكروت والميكرو:

- كل جملة معاها context\_ar، وكلمة الـ cloze موجودة فعلًا جوه الجملة. لو فشل، العنصر بيتولّد تاني.
- في 3 أمثلة للأداة، والأمثلة ماشية مع فحص المفردات، وسؤال الـ notice فيه إجابة واحدة صح. لو فشل، الميكرو بيتولّد تاني.
- مهمة الصبح ماشية بجملة من جمل اليوم. لو فشل، الميكرو بيتولّد تاني.

الـ lemmatizer بتاع فحص المفردات ممكن يغلط، خصوصًا مع تصريف الأفعال. عشان كده ابدأه كـ **تحذير** في أول أسبوع، ولما تتأكد إنه دقيق حوّله لـ **إعادة توليد**.

## نظام الصور: الثابت والمتغيّر

البرومبت النهائي بيتركّب من 3 طبقات. أول اتنين ثابتين ومبيتغيّروش أبدًا: **الستايل** و**الشخصيات**. الطبقة التالتة هي **image\_spec**، ودي الحاجة الوحيدة اللي Claude بيكتبها.

### الستايل (نهائي)

```text
Friendly educational cartoon illustration for adult learners, clean bold dark-navy outlines of even weight, flat colors with soft subtle shading, warm cheerful palette (sunny yellow, sky blue, leaf green, coral, soft orange), plain warm cream background, centered subject with generous empty space around it, modern language-learning textbook style. Adult realistic body proportions, small natural eyes, subtle expressions, not cute, not childish, no chibi, no big heads. No text, no letters, no numbers, no watermark.
```

### الشخصيات

أي شخصية محتاجة صفحة مرجع (reference sheet) معتمدة قبل ما تظهر في أي صورة. الوصف بيتحط في البرومبت، وصورة المرجع بتتبعت معاه. ياسين وإنِس اتثبتوا خلاص. الباقي لسه اقتراح.

| id | الدور | الوصف في البرومبت |
| --- | --- | --- |
| yassin | المتعلم | Egyptian man in his late 20s, warm light-brown skin, short dark curly hair, neat short beard, olive-green jacket over a plain white t-shirt, dark blue jeans, white sneakers, brown backpack |
| ines | صديقة وزميلة شغل | Portuguese woman in her late 20s, fair skin with light freckles, shoulder-length wavy chestnut hair, mustard-yellow cardigan over a navy-and-white striped top, dark grey trousers, brown ankle boots, small gold earrings |
| rita | كاشير السوبرماركت | Portuguese woman about 45, short dark-brown bob, reading glasses on a cord, navy polo shirt uniform with a blank name badge |
| manuel | صاحب الكافيه | Portuguese man about 60, short grey hair, grey moustache, white shirt with rolled sleeves, dark brown apron |
| sofia | الصيدلانية | Portuguese woman about 35, black hair in a low bun, white coat over a light blue blouse |
| carlos | صاحب الشقة | Portuguese man about 50, stocky, short salt-and-pepper hair, beige knitted sweater, dark trousers |

أي حد في الخلفية بيترسم بشكل بسيط وملوش اسم. ولو حد ظهر في أكتر من يوم، زي الدكتور أو موظف Finanças، بيتضاف للجدول ده وتتعمله صفحة مرجع.

### حقول image\_spec (اللي Claude بيملاها)

| الحقل | المعنى | مثال: verb.go |
| --- | --- | --- |
| type | object / action / emotion / place / scene / story\_panel | action |
| subject | اللي بيظهر في الصورة في جملة واحدة | yassin walking toward a tram stop |
| characters | ids من جدول الشخصيات | yassin |
| pose | الحركة أو الوضع | mid-stride, side view |
| expression | تعبير الوش | calm, determined |
| setting | المكان، لو فيه | Lisbon sidewalk, yellow tram far behind |
| framing | close-up / upper body / full body / wide | full body |
| light | الإضاءة والجو، للمشاهد والقصص | morning sun |
| must\_show | حاجات لازم تبان | his legs clearly in motion |
| must\_avoid | حاجات ممنوعة في الصورة دي | running, other people |

المقاس مش من ضمن الحقول، الكود بيحدده من الـ type. وClaude ملوش دعوة بالستايل خالص.

## قوالب برومبت الصور

الكود بيركّب البرومبت بالترتيب ده:

1. سطر المرجع.
2. الستايل.
3. قالب النوع، بعد ما يتملا من image\_spec.
4. سطر must\_show وmust\_avoid.

القوسين {} معناهم حقل بيتملا. ومكان اسم الشخصية، الكود بيحط الاسم ومعاه وصفها من جدول الشخصيات.

### سطر المرجع

**لو في الصورة شخصيات**، بتتبعت صفحات المرجع بتاعتهم مع السطر ده:

```text
Use the attached reference images for the exact look of these characters: {names}. Same face, hair, skin tone, outfit and colors. Draw each named character exactly once.
```

**لو مفيهاش شخصيات**، بتتبعت صورة واحدة معتمدة من نفس النوع كـ «style anchor»، ومعاها السطر ده:

```text
Use the attached image only as a style reference: same line weight, colors and shading. Do not copy its subject.
```

### قالب كل نوع

| type | المقاس | القالب |
| --- | --- | --- |
| object | 1024×1024 | Subject: a single {subject}, three-quarter view from slightly above. Isolated, nothing else in the frame, no hands, no people, no plate or table unless part of the subject. |
| action | 1024×1024 | Subject: {characters} {subject}, {pose}, {framing}, {expression}. Setting: {setting}, kept simple and in the background. The action must be instantly clear without any words. |
| emotion | 1024×1024 | Subject: {characters} showing {subject}, {expression}, {pose}, upper body, front view. No background objects. |
| place | 1536×1024 | Subject: the outside of {subject} in Lisbon, {setting}, {light}. All signs are blank shapes with no letters. |
| scene | 1536×1024 | Wide view of {subject}, {setting}. {characters} {pose}. {light}. Background people are simple and unnamed. All signs, labels, price tags and screens are blank. |
| story\_panel | 1536×1024 | Comic panel. {characters} {subject}, {pose}, {expression}. Setting: {setting}. {framing}, {light}. Cinematic composition, no speech bubbles, no captions, no sound effects. |

والسطر الأخير ثابت في كل الأنواع:

```text
Must show: {must_show}. Avoid: {must_avoid}.
```

### مثال بعد التركيب (verb.go)

البرومبت ده بيتبعت مع صفحة مرجع ياسين.

```text
Use the attached reference images for the exact look of these characters: Yassin. Same face, hair, skin tone, outfit and colors. Draw each named character exactly once.

Friendly educational cartoon illustration for adult learners, clean bold dark-navy outlines of even weight, flat colors with soft subtle shading, warm cheerful palette (sunny yellow, sky blue, leaf green, coral, soft orange), plain warm cream background, centered subject with generous empty space around it, modern language-learning textbook style. Adult realistic body proportions, small natural eyes, subtle expressions, not cute, not childish, no chibi, no big heads. No text, no letters, no numbers, no watermark.

Subject: Yassin (Egyptian man in his late 20s, warm light-brown skin, short dark curly hair, neat short beard, olive-green jacket over a plain white t-shirt, dark blue jeans, white sneakers, brown backpack) walking toward a tram stop, mid-stride, side view, full body, calm and determined. Setting: Lisbon sidewalk with a small yellow tram far behind, kept simple and in the background. The action must be instantly clear without any words.

Must show: his legs clearly in motion. Avoid: running, other people.
```

### فحص الصورة بعد التوليد

موديل رؤية رخيص، زي Claude Haiku، بيجاوب على 4 أسئلة. لو أي إجابة غلط، الصورة بتتولّد تاني مرة واحدة. لو فشلت تاني، بتروح لطابور المراجعة.

1. في الصورة أي كلام أو حروف أو أرقام؟ المفروض لأ.
2. فيها كام شخص في المقدمة؟ المفروض يساوي عدد characters.
3. الـ subject باين من غير شرح؟
4. الخلفية كريمي وفيها خطوط كحلي زي المرجع؟

## الإعدادات والتكلفة

الـ 90 يوم بالصور هتكلّف تقريبًا **من 30 لـ 45 دولار**، وده شامل إعادات التوليد. الأرقام دي تقدير، وهتعرف الرقم الحقيقي بعد أول 3 أيام.

### OpenAI

| الإعداد | القيمة |
| --- | --- |
| Model | gpt-image-2.5-flare-2026-09-08 (النسخة اللي عليها تاريخ، عشان الستايل ميتغيّرش) |
| Endpoint | اللي بياخد صور مرجع مع البرومبت (edits)، لأن كل صورة معاها مرجع أو style anchor |
| Quality | medium، وhigh لصفحات مرجع الشخصيات بس |
| Size | بيتحدد من الـ type (الجدول اللي فوق) |
| Background | للـ object جرّب transparent، عشان الكارت هو اللي يحدد اللون. باقي الأنواع كريمي |
| n | 1، ولصفحات المرجع 3 |
| Format | PNG، وCloudinary بيحوّلها WebP وهو بيعرضها |

### Claude

| الإعداد | القيمة |
| --- | --- |
| Model | Sonnet لتوليد الأيام، وHaiku لفحص الصور |
| Output | structured output بالـ schema |
| Caching | على برومبت الـ system والقوائم الثابتة |
| Batch | لأي أيام بتتولّد مسبقًا، لأنه أرخص 50% |

### التكلفة التقريبية

| البند | الحساب | تقريبًا |
| --- | --- | --- |
| توليد الأيام | حوالي 10 آلاف token output لليوم × $15 للمليون × 90 يوم، وBatch بينزّلهم للنص | $8–$15 |
| الصور | من 700 لـ 900 مفتاح جديد × حوالي $0.013–$0.02، زائد تمن صور المرجع اللي بتتبعت مع الطلب | $15–$25 |
| إعادات التوليد | حوالي 20% زيادة على الاتنين | $5 |
| فحص الصور | Haiku على كل صورة | أقل من $2 |

سعر الصورة جاي من [Grida](https://grida.co/docs/models/gpt-image-2.5)، وهو مصدر طرف تالت. عدد الصور بيقل مع الوقت، لأن المفاتيح بتتعاد استخدامها أكتر، والجمل أصلًا بتاخد أيقونات مش صور. ولما تضيف الإنجليزي والألماني، أغلب الصور هتبقى موجودة جاهزة.

## الخطوات الجاية

- [ ] وافق على جدول النطق بالحروف العربي، أو عدّله.
- [ ] ولّد صفحات مرجع لـ rita وmanuel وsofia وcarlos، واعتمد صورة style anchor واحدة لكل نوع.
- [ ] جهّز القوائم الثابتة: الـ 150 أيقونة، وكلمات الربط، وقوائم الكلمات الممنوعة.
- [ ] ابني الـ schema والفحوصات في Cursor من الجداول اللي فوق.
- [ ] شوف فورمات صفحة الدردشة ماشي مع فورمات الـ lesson pack في Ai-pt-agent ولا لأ، عشان الـ agent يشغله زي ما هو.
- [ ] جرّب الأيام من 1 لـ 3 للآخر، من التوليد لحد الصور. راجعهم بنفسك، وبعدين ابعت الأيام من 4 لـ 30 في Batch.
- [ ] قرّر هتعمل إيه مع المستخدمة. النصوص فيها pt\_f وar\_f خلاص، بس الصور كلها فيها ياسين. محتاج تحدد هل هتعمل شخصية بنت بنفس الدور.
