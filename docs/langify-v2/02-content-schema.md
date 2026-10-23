<!--
Source: Claude Docs "Langify · Schema المحتوى" — https://claude.ai/code/artifact/3bac29ec-3272-45bf-b91a-5eab2938849b
Exported 2026-10-19. Language: Egyptian Arabic with English field names.
-->
# 02 · Content schema

> **For Cursor, in English:** this doc defines the content JSON (lesson → page → block → item). Field names, block types, modes, control types, target addressing and presets are all in English inside the Arabic text. Turn it into: (1) TypeScript types shared by backend and mobile, (2) a runtime validator (zod) that also checks the "التحقق" rules near the end, (3) a Mongoose model `v2_lessons` in `ai-agent-talk`. `examples/day06-example.json` must pass the validator unchanged. The decisions in `00-decisions.md` §2–4 summarise this doc in English. If they conflict, `00` wins.


## الفكرة

أي موضوع، سواء كان قاعدة أو جمل أو قاموس أو قصة، بيتبني من **نفس الـ 4 طبقات**. اللي بيتغيّر من موضوع لموضوع هو البلوكات اللي بنختارها وترتيبها بس، مش شكل الـ JSON.

1. **الدرس (lesson):** يوم من الخطة، وفيه من 4 لـ 6 صفحات.
2. **الصفحة (page):** بوستر واحد زي صفحة الكتاب. فيه عنوان، وبلوكات ورا بعض، وطريقة تفاعل.
3. **البلوك (block):** قطعة من البوستر، زي جدول أو مقارنة أو بوكس قاعدة. الأنواع **قايمة مقفولة فيها 14 نوع**، وكل نوع component واحد في React Native.
4. **العنصر (item):** المحتوى نفسه، زي كلمة أو جملة أو تصريف أو تركيبة. العنصر بيتكتب مرة واحدة في بنك العناصر، والبلوكات بتشاور عليه بالـ id. الكروت والأسئلة والـ SRS بيشاوروا على نفس الـ id برضه.

ليه الشكل ده:

- **أي موضوع جديد** بيتعمل بترتيب جديد لبلوكات موجودة، من غير component جديد ولا تعديل في الـ schema.
- **الإنجليزي والألماني** هيستخدموا نفس الـ schema، لأن مفيش حقل اسمه pt. اللغة اللي بتتعلّم اسم حقلها tl.
- **التصريف بيجي من جدول متراجع، مش من Claude.** كده مفيش فرصة إن فعل يتصرّف غلط.

## قواعد عامة في كل الـ schema

### حقول اللغة

أسماء الحقول دي ثابتة في أي مكان فيه نص. والدرس كله فيه حقل واحد اسمه target_lang، زي pt-PT أو en-GB أو de-DE.

| الحقل | المعنى | مثال |
|---|---|---|
| tl · tl_f | النص باللغة اللي بتتعلّم، ونسخة المتكلمة لو بتفرق | Obrigado · Obrigada |
| ar · ar_f | المعنى، بالفصحى البسيطة | أنا متعب · أنا متعبة |
| eg | شرح أو ملحوظة، بالعامية المصرية | المكان بيتغير، فبنقول ESTAR |
| say | النطق بحروف عربي | كايچو |
| ipa | النطق بـ IPA، وبيكون متخبي | /ˈkɐj.ʒu/ |
| audio | النص اللي بيتقرا، لو مختلف عن tl | quatro euros e cinquenta |

### النص الغني (rt)

أي نص فيه عربي وبرتغالي مع بعض مابيتكتبش string واحد. بيتكتب **قايمة قطع**، وكل قطعة فيها: text، وlang (eg أو ar أو tl)، وbold (اختياري)، وgroup (اختياري، للون). الـ app بيدي كل قطعة اتجاهها لوحدها، وده بيقفل bug زي «queijo o» من الأساس. الملحوظات، والقواعد، والتلميحات، والأسئلة، كلهم rt.

### المجموعات (group)

الـ JSON مفيهوش ألوان خالص. فيه **معنى اللون** بس، من قايمة مقفولة، والتصميم هو اللي بيختار اللون.

| group | بيتستخدم في |
|---|---|
| a · b · c | أطراف أي مقارنة: SER وESTAR، أو -ar و-er و-ir، أو este وesse وaquele |
| m · f | المذكر والمؤنث |
| verb · prep · pron · neg | تلوين جوه الجملة: الفعل، حرف الجر، الضمير، النفي |
| neutral | الباقي |

يعني أي صفحة مقارنة بتاخد ألوان a وb، مهما كان موضوعها.

### الـ ids

- **العناصر:** اسم الفكرة بالإنجليزي، زي food.cheese وphrase.ask_price وverb.falar. الـ id ثابت طول عمر العنصر.
- **البلوكات:** الـ id محلي جوه الصفحة، زي b1 وb2. الخطوات والـ controls بتشاور عليه.
- **الصور والأيقونات:** media فيه واحد من اتنين: image (مفتاح صورة) أو icon (اسم من القايمة الثابتة).

## العناصر (بنك المحتوى)

العناصر خمس أنواع بس. البلوكات مبتكتبش نص بلغة التعلم من عندها خالص، بتشاور على عنصر. الاستثناء الوحيد العناوين والملحوظات.

| النوع | مثال | الحقول |
|---|---|---|
| word | o queijo | id، tl (بأداة التعريف)، lemma، gender، plural، ar، say، ipa، pos، rank، media، example (id جملة) |
| phrase | Quanto custa? | id، tl · tl_f، ar · ar_f، say، ipa، marks، media (أيقونة)، context_eg، cloze، audio |
| sentence | Estou em casa. | id، tl، ar، say، marks، speaker (id شخصية)، gloss (شرح كلمات جديدة جوهها) |
| form | falamos | id، lemma، tense، person، tl، stem، ending، irregular، say |
| pattern | Queria + حاجة + por favor | id، slots، examples (ids جمل) |

### تفاصيل مهمة

- **marks:** قايمة {النص اللي هيتلوّن، group}. مثلًا «Uma» ومعاها f، أو «Estou» ومعاها b. من هنا التلوين جوه الجملة بيشتغل في أي بلوك.
- **form:** الـ id بالشكل ده: verb.falar:pres:nos.
    - tense من قايمة مقفولة: inf، pres، pret، imperf، fut، cond، imp.
    - person من قايمة مقفولة: eu، tu، ele، nos، eles. صف ele بيتعرض «ele / ela / você»، وo senhor بياخد نفس الـ form.
    - stem وending متقسّمين عشان النهاية تتلوّن لوحدها. الفعل الشاذ (sou) مالوش stem، وبيتلوّن كله.
    - **الـ forms بتتولّد من جدول تصريف متراجع بيتحمّل مرة واحدة.** Claude بيطلبها بالـ id، ومبيكتبهاش.
- **pattern.slots:** قايمة. كل عنصر فيها يا إما نص ثابت (tl) يا إما خانة فاضية ليها اسم بالعامية وgroup، زي «الفاعل» أو «حاجة». نفس الشكل بيغطي «Queria + حاجة» و«الفاعل ← الفعل ← المفعول».
- الكلمة والجملة هم اللي بيدخلوا الـ flashcards. الـ form والـ pattern بيدخلوا بنك الأسئلة بس.

## الصفحة

الصفحة عبارة عن عنوان، وبعده بلوكات مرصوصة من فوق لتحت، وطريقة تفاعل واحدة. أي ترتيب أفقي، زي عمودين أو شبكة كروت، بيبقى جوه البلوك نفسه. كده الصفحة نفسها دايمًا قايمة واحدة بسيطة.

| الحقل | المعنى | مثال |
|---|---|---|
| id · preset | القالب اللي الصفحة مبنية عليه (قسم القوالب تحت) | p2 · compare |
| tool_id | القاعدة اللي الصفحة بتشرحها، لو فيه | ser_vs_estar |
| pill | الليبل اللي فوق العنوان | القواعد |
| title | العنوان الكبير، rt بمجموعات | SER (a) vs ESTAR (b) |
| subtitle | سطر واحد، rt | الاتنين معناهم «يكون» |
| mode | guided أو explore أو static | guided |
| blocks | البلوكات بالترتيب | — |
| steps | للـ guided بس | — |
| controls | للـ explore بس | — |
| locked_until | بلوكات بتفضل مقفولة لحد ما control يخلص | practice بيفتح بعد الجدول |
| quiz | 3 أسئلة لزرار «اختبرني» | ids من بنك الأسئلة |
| library | الصفحة تتحفظ في المكتبة ولا لأ | true |

وفي كمان حقل cover: بيحدد «غطّي» هيخبّي إيه، meaning أو tl أو endings. أما قايمة العناصر اللي الصفحة بتستخدمها فمش حقل بيتكتب. الكود بيجمعها من الـ refs اللي جوه البلوكات، عشان الـ SRS والكروت.

## كتالوج البلوكات

في 14 نوع بلوك بس، والقايمة مقفولة. أي بلوك فيه id وtype، وفيه كمان group اختياري. والمحتوى دايمًا refs لعناصر، والعناوين والملحوظات rt.

| type | بيبان إزاي | الحقول | الحد على الموبايل |
|---|---|---|---|
| heading | شريط عنوان لقسم | text (rt) | سطر واحد |
| cards | شبكة كروت، وكل كارت فيه صورة أو أيقونة ونص | items (refs)، cols (2/3/4)، numbered | 20 كارت |
| table | جدول فيه راس للأعمدة وراس للصفوف | cols [{label, group}]، rows [{label, media}]، cells (ref أو rt في كل خانة)، split_endings | 4 أعمدة و 8 صفوف |
| compare | عمودين أو تلاتة جنب بعض، وكل عمود ليه راس ومدخلات | columns [{head, sub, group, entries [{label, ref, media}]}] | 3 أعمدة و 7 مدخلات |
| vs_pairs | جملتين جنب بعض بينهم VS | pairs [{left, right, note}] | 5 |
| formula | التركيبة كخانات بأسهم، وتحتها أمثلة | pattern (ref)، examples (refs) | 4 خانات و 3 أمثلة |
| examples | شريط أمثلة بصور زي آخر صفحات الكتاب | items [{ref, media, group}] | 4 |
| tip | بوكس أصفر فيه لمبة | kind (rule / culture / warning)، title، body (rt) | 3 جمل |
| rules_list | قايمة مرقّمة لقواعد أو استثناءات | items (rt) | 4 |
| dialogue | سطور حوار، وكل سطر ليه متكلم | lines (refs جمل) | 8 |
| scene | مشهد عريض، وعليه نقط بتتداس | image، hotspots [{x, y, ref}] | 8 نقط |
| panel | لوحة قصة، وتحتها جملها | image، lines (refs) | 3 جمل |
| timeline | محور زمن: امبارح ← دلوقتي ← بكره | points [{at: past/now/future, ref, label}] | 5 |
| practice | تمرين جوه الصفحة | questions (ids من البنك) | 3 |

### تفاصيل

- **table.cells:** مصفوفة صفوف × أعمدة. لو الخانة form وsplit_endings شغال، الجذر بيبان رمادي والنهاية بلون عمودها.
- **table.rows[].media:** صورة الشخص جنب الضمير. دي الطريقة اللي الكتاب بيعلّم بيها الضماير. الصور الخمسة ثابتة في كل الأبلكيشن: person.eu، person.tu، person.ele، person.nos، person.eles.
- **البلوك مابيحطش بلوك جواه.** الحاجات اللي جوه compare أو table عناصر وrt بس. كده الـ JSON مستواه ثابت، ومفيش شجرة مفتوحة.

## التفاعل

الصفحة ليها واحد من 3 أوضاع، وده بيبان في حقل mode. البلوكات نفسها مبتتغيّرش من وضع لوضع. اللي بيتغيّر هو اللي بيكشفها.

| mode | التجربة | مناسب لـ | النموذج |
|---|---|---|---|
| guided | الصفحة بتتبني لوحدها زي درس متسجل، وبتقف عند الأسئلة بس | قواعد محتاجة شرح، زي SER وESTAR | SER ou ESTAR |
| explore | المستخدم بيحرّك الصفحة بـ control، وكل ضغطة بتكشف حاجة كاملة | جداول التصريف والأنماط | Falo, Como, Abro |
| static | الصفحة بتظهر كاملة من الأول | الجمل والقاموس، والصفحات اللي في المكتبة | — |

### العنوان جوه البلوك (target)

الخطوة أو الـ control بيشاور على بلوك كله، أو على جزء منه. الشكل ثابت:

- b2: البلوك كله.
- b2/col:0: راس عمود.
- b2/row:3: صف كامل.
- b2/cell:3:1: خانة.
- b2/entry:1:2: مدخل رقم 2 في عمود 1، في compare.
- b4/item:2: كارت أو زوج أو نقطة.

### الخطوات (guided)

| الحقل | المعنى |
|---|---|
| target | الحتة اللي هتظهر |
| kind | reveal (تظهر وتتقرا) أو ask (سؤال قبل ما تظهر) |
| tip | سطر إنِس، rt، 15 كلمة بالكتير |
| ask | question (rt)، وoptions [{label, correct}]، وwhy، وhint |
| chapter | اسم الفصل في شريط التشغيل، زي SER أو «الصعب» |

### الـ controls (explore)

| type | بيعمل إيه | الحقول |
|---|---|---|
| reveal_axis | شريط اختيارات. كل اختيار بيكشف صف أو عمود كامل، زي الأشخاص في جدول التصريف | target (بلوك)، axis (rows/cols)، tips (سطر لكل اختيار) |
| swap | زرار بيغيّر الفعل اللي في عمود، والـ forms بتتحسب من جدول التصريف | target (بلوك/عمود)، options (ids أفعال) |
| unlock | لما كل الاختيارات تتكشف، البلوكات اللي في locked_until بتفتح | بيتحسب لوحده |

### «غطّي» في كل الأوضاع

بعد ما الصفحة تكمل، زرار «غطّي» بيخبّي واحدة من 3 حاجات، حسب حقل cover في الصفحة: meaning (المعنى)، أو tl (اللغة)، أو endings (النهايات). مثلًا صفحة الجمل بتخبّي meaning، وجدول التصريف بيخبّي endings.

## القوالب الجاهزة (presets)

القالب ترتيب بلوكات متفق عليه مسبقًا. Claude بيختار القالب اللي يناسب القاعدة ويملاه. ولو الموضوع مش ماشي مع أي قالب، بيستخدم free ويرتّب البلوكات بنفسه، من الكتالوج بس.

| preset | mode | البلوكات بالترتيب | بيستخدم لـ |
|---|---|---|---|
| phrases | static | cards (6، أيقونات) ← tip | جمل اليوم |
| compare | guided | compare ← heading ← vs_pairs ← tip | SER/ESTAR، o/a، este/esse/aquele، por/para |
| conjugation | explore | table ← practice ← examples ← tip | SER، ESTAR، IR، TER، النهايات، الماضي |
| pattern | guided | formula ← examples ← practice ← tip | Queria +، ir + فعل، ترتيب الجملة، النفي |
| dictionary | static | cards (8–12، صور) | الأكل، المواصلات، اللبس |
| scene | static | scene | السوبرماركت، البيت، شجرة العيلة |
| story | guided | panel × 4 | قصة الأسبوع |
| free | أي mode | أي بلوكات من الكتالوج | أي موضوع مش ماشي مع قالب |

### صفحات الكتاب مبنية بالبلوكات دي

رجعت لصفحات Fundamentals في الكتاب عشان أتأكد إن الكتالوج مكفّي. ولقيت إن كل صفحة منهم بتتبني من الـ 14 بلوك من غير نوع جديد:

| صفحة الكتاب | البلوكات |
|---|---|
| 62 SER vs ESTAR | compare (عمودين) ← heading ← vs_pairs (4) |
| 67 نهايات الأفعال | table (3 أفعال، split_endings) ← examples (3) ← tip |
| 64 الملكية | table (الشخص × مفرد/جمع) ← examples (4) ← tip |
| 66 المذكر والمؤنث | compare (مدخلات بصور) ← rules_list ← practice |
| 65 النفي | vs_pairs (1) ← cards (4) ← table (كلمات النفي) ← tip ← practice |
| 61 ترتيب الجملة | formula ← rules_list (3) ← practice |
| 63 جمل النجاة | cards (20، 4 أعمدة، مرقّمة) |
| 72 العيلة | scene (رسمة شجرة العيلة من غير كلام، وعليها نقط) |
| 172 الأزمنة | timeline |

قالب compare ماشي مع نموذج SER ou ESTAR، وقالب conjugation ماشي مع نموذج Falo, Como, Abro. يعني النموذجين اللي عملناهم هما نفسهم اتنين من القوالب دي.

## التحقق

الـ schema بنفسها بتقفل الأنواع والقيم الثابتة (structured output). والكود بيعمل الفحوصات دي فوقيها، قبل ما الصفحة تتخزن:

| الفحص | القاعدة |
|---|---|
| الـ refs | كل ref بيشاور على عنصر موجود في البنك. أي form لازم يبقى موجود في جدول التصريف |
| الـ targets | كل target في الخطوات والـ controls بيشاور على بلوك أو جزء موجود |
| التغطية | في guided، كل بلوك بيظهر في خطوة. مفيش ask في أول 3 خطوات، وفي ask واحد على الأقل كل 4 خطوات |
| شكل الجدول | عدد الخانات في كل صف = عدد الأعمدة |
| الأسئلة | في كل ask اختيار واحد بس correct |
| المجموعات | كل group من القايمة. وأي مقارنة بتاخد a وb (وc) بالترتيب |
| النص المخلوط | مفيش string فيه حروف عربي ولاتيني مع بعض بره rt |
| حدود الموبايل | الحدود اللي في جدول الكتالوج. والصفحة نفسها فيها 8 بلوكات بالكتير |

أي صفحة بتفشل بتتولّد تاني مرة واحدة، ومعاها رسالة الخطأ. نفس القاعدة اللي في مستند التوليد.

## اللي بيتغيّر في برومبت Claude

في مستند التوليد، قسم «حقول كل نوع صفحة» بقى القوالب الجاهزة اللي فوق. وفي البرومبت، البلوك ده بيحل محل PAGE STEPS:

```text
PAGES
Build every page from the block catalog only: heading, cards, table, compare, vs_pairs, formula, examples, tip, rules_list, dialogue, scene, panel, timeline, practice. Never invent a block type or put a block inside a block.
1. Pick a preset for each page: phrases, compare, conjugation, pattern, dictionary, scene, story. Use free only when none fits, and say why in preset_reason.
2. Blocks never hold target-language text directly. They point to items by id. Write each new word, phrase, sentence and pattern once in ITEMS.
3. Conjugated verbs are never written by you. Refer to them as form ids: verb.<lemma>:<tense>:<person>, with tense one of inf, pres, pret, imperf, fut, cond, imp and person one of eu, tu, ele, nos, eles. Use only lemmas in VERB_TABLE.
4. Any text that mixes Arabic and the target language is rich text: a list of segments, each with text, lang (eg, ar or tl) and an optional group.
5. Colors are meanings, not colors: group is one of a, b, c, m, f, verb, prep, pron, neg, neutral. Sides of a comparison are a, b, c in order.
6. guided pages need steps (12-20, an ask about every fourth step, none in the first 3). explore pages need controls. static pages need neither.
```

ورسالة الطلب بتاعة كل يوم بيتضافلها حاجتين:

- **VERB_TABLE:** الأفعال اللي ليها تصريف متراجع لحد اليوم ده، أسماء بس من غير التصريف.
- **PAGE_PLAN:** الـ preset المقترح لكل صفحة من الخطة، زي «يوم 5: conjugation (SER)، يوم 6: compare (SER/ESTAR)».

الخطوة الجاية إنك تبني الـ 14 component في React Native مرة واحدة، ومعاهم renderer بيقرا الـ JSON. بعد كده أي موضوع جديد مش محتاج منك أي شغل في الواجهة.
