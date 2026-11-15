# 14b · Library content plan (voices + 20 briefs)

Status: draft for Omar's review, 2026-11-13. Companion to `14-library.md`. Where this file gives more detail than `14` (catalog, voice registry), **this file wins**.

What Omar fills: every `<<…>>` placeholder in §1. Everything in §2–§3 is ready for review; edit freely before approving.

Language rule: briefs are in Egyptian Arabic. No Portuguese is written here on purpose. The model writes the Portuguese from the brief. If Omar knows the exact street phrase for a moment, he adds it as `must_say`.

How Cursor uses this file: task LA1 (`14d`) turns §1 into `content/v2/library/voices.json`, §2 into `content/v2/library/moments.json`, and each brief in §3 into one brief file that the admin import turns into a `v2_library_briefs` document (status `draft`). Placeholders stay as they are until Omar fills them; the audio build refuses to run while any voice of an episode's cast is still a placeholder.

---

## 1. Voices (ElevenLabs)

### 1.1 Global

| Setting | Value |
|---|---|
| Model | `<<ELEVENLABS_MODEL_ID>>` |
| Language setting (if the model has one) | Portuguese |
| Output format | `<<OUTPUT_FORMAT>>` (e.g. mp3 44.1 kHz) |
| Monthly character cap | `<<MONTHLY_CHAR_LIMIT>>` |

### 1.2 Speed per level

Starting values; adjusted by listening in LA6.

| Level | Speed |
|---|---|
| 1 | `<<SPEED_L1>>` (start ~0.85) |
| 2 | `<<SPEED_L2>>` (start ~0.9) |
| 3 | `<<SPEED_L3>>` (start ~0.95) |
| 4 | `<<SPEED_L4>>` (start ~1.0) |
| 5 | `<<SPEED_L5>>` (start ~1.0) |

### 1.3 Recurring cast

Gender comes from `content/v2/characters.json`. Settings are fixed per voice.

| Key | Who | ElevenLabs voice id | Stability | Similarity | Style | Approved |
|---|---|---|---|---|---|---|
| yassin | the learner (male version) | `<<VOICE_ID_YASSIN>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| learner_f | the learner (female version, for `tl_f` lines) | `<<VOICE_ID_LEARNER_F>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| ines | colleague, 28 | `<<VOICE_ID_INES>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| tiago | young man, 24 | `<<VOICE_ID_TIAGO>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| nour | Egyptian friend, early 30s | `<<VOICE_ID_NOUR>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| sofia | 35 | `<<VOICE_ID_SOFIA>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| rita | 45 | `<<VOICE_ID_RITA>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| carlos | 50 | `<<VOICE_ID_CARLOS>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| manuel | 60 | `<<VOICE_ID_MANUEL>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| graca | Dona Graça, 72 | `<<VOICE_ID_GRACA>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |
| narrator | neutral narrator | `<<VOICE_ID_NARRATOR>>` | `<<S>>` | `<<SIM>>` | `<<STY>>` | ☐ |

nour isn't used in the first 20 episodes (two Egyptian friends would speak Arabic together); fill it later.

### 1.4 Pool (new characters: cashiers, pharmacists, strangers)

Inside one episode, code picks pool voices that aren't used by anyone else in the cast.

| Key | Gender | Age feel | ElevenLabs voice id | Approved |
|---|---|---|---|---|
| pool_m_1 | m | 30s | `<<VOICE_ID_POOL_M_1>>` | ☐ |
| pool_m_2 | m | 20s | `<<VOICE_ID_POOL_M_2>>` | ☐ |
| pool_m_3 | m | 50s | `<<VOICE_ID_POOL_M_3>>` | ☐ |
| pool_m_4 | m | 40s | `<<VOICE_ID_POOL_M_4>>` | ☐ |
| pool_f_1 | f | 30s | `<<VOICE_ID_POOL_F_1>>` | ☐ |
| pool_f_2 | f | 20s | `<<VOICE_ID_POOL_F_2>>` | ☐ |
| pool_f_3 | f | 50s | `<<VOICE_ID_POOL_F_3>>` | ☐ |
| pool_f_4 | f | 40s | `<<VOICE_ID_POOL_F_4>>` | ☐ |

Approval rule (`14` §2.7): a voice is approved only after it passes the pt-PT check script by ear.

---

## 2. Moment bank (`moments.json`)

Egyptian only, grouped by place. `must_say` empty unless Omar adds one.

- **cafe:** الكرسي ده فاضي؟ · فيه واي فاي؟ الباسورد إيه؟ · ينفع أشحن الموبايل هنا؟ · القهوة سادة ولا بلبن؟ · زبون بيطلب "زي كل يوم".
- **padaria:** العيش ده طازة النهارده؟ · عايز كيس؟ · ممكن تقطّعه؟
- **street_transport:** ده الخط الصح لـ…؟ · الكرسي ده فاضي؟ · لو سمحت هنزل (عشان يعدّي) · المحطة الجاية إيه؟ · إنت مش من هنا؟
- **ticket_office:** ينفع أشحنه من المكنة؟ · معاك الكارت؟ · عايز وصل؟
- **supermarket:** حد معاه حاجة واحدة وإنت بتعدّيه قدامك · الكاشير ده فاتح؟ · الحاجة دي خلصت؟ هتيجي إمتى؟ · مكنة الدفع الذاتي علقت · العرض ده شغال على النوع ده؟ · إنت آخر واحد في الطابور؟
- **market:** ممكن أدوق؟ · عايزهم للأكل النهارده ولا بعد كام يوم؟ · واحدة كبيرة بتفاصل مع البياع.
- **pharmacy:** محتاج روشتة؟ · فيه بديل أرخص؟ · بتاخد أي دوا تاني؟ · ينفع آخده مع دوا تاني؟
- **restaurant:** الأكل ده حار؟ · فيه أوبشن نباتي؟ · ده فيه لحم خنزير؟ · ممكن من غير بصل؟ · الطبق كبير؟ ينفع نص طبق؟ · العيش والزيتون اللي على الترابيزة بفلوس؟ · تنصحني بإيه؟ · الجرسون يسأل "كله تمام؟" · كل واحد يدفع لوحده؟
- **gym:** محتاج الوزن ده؟ · لسه شغال على الجهاز ده؟ · ينفع أشاركك على الجهاز؟ · باقيلك كام جولة؟ · ممكن تساعدني في الرفعة دي؟ · الفوطة دي بتاعتك؟ · فين اللوكرز، ومحتاج قفل؟ · الجهاز ده عطلان؟ · حد بيقول "رجّع الأوزان مكانها".
- **phone_call:** ممكن تتهجى اسمك؟ · ممكن تكرر الرقم؟ · رسالة مسجلة "دوس ١…" · المكالمة بتتحول لقسم تاني · ممكن تأكد الإيميل؟ · سامعني؟ الصوت بيقطع.
- **landlord:** مسموح بحيوانات أليفة؟ · فيه عقد وإيصالات؟ · الجيران هاديين؟ · الشقة باردة في الشتا؟ · ينفع أدهن الحيطة؟ · إنت شغال فين؟ · فيه حد تاني هيسكن معاك؟
- **bank:** فيه حساب من غير مصاريف؟ · الكارت يوصل إمتى؟ · إنت ساكن هنا من إمتى؟
- **mechanic:** هيكلف كام تقريباً قبل ما تبدأ؟ · آخر صيانة إمتى؟ · أقدر أسوقها كده لحد ما تتصلح؟
- **neighbours:** الغسالة بالليل · لو فيه حاجة قوليلي على طول · جار تاني اشتكى كمان.
- **work:** تقدر تبدأ إمتى؟ · ينفع جزء من الشغل من البيت؟ · ينفع أنضم المرة الجاية؟

Directions used below: **يسأل** (the learner asks) · **يتسأل** (someone asks the learner) · **يسمع** (the learner only hears it). In podcasts with no learner (episode 17), directions don't apply.

---

## 3. Briefs (20 episodes)

Format per brief: slug · type · level · setup (`intro_eg`) · cast (role → voice key) · beats in order · real moments · notes. Cast keys with `pool_*` mean a new character using that pool voice. The learner is `yassin` (the player uses `learner_f` for learners set to female).

### Level 1 · سهل جداً

**01 · `cafe-manha` · story · L1**
- Setup: الصبح، إنت في الكافيه اللي تحت البيت قبل الشغل.
- Cast: yassin · manuel (صاحب الكافيه) · pool_f_1 (زبونة)
- Beats: ١. تحية الصبح. ٢. يطلب قهوة وحاجة حلوة. ٣. manuel يسأل هنا ولا تيك أواي. ٤. يسأل الحساب كام. ٥. يدفع ويقعد. ٦. سلام وهو خارج.
- Moments: يسأل: الكرسي ده فاضي؟ (للزبونة) · يسمع: زبون بيطلب "زي كل يوم".
- Notes: scene 1 counter, scene 2 table.

**02 · `padaria-pao` · story · L1**
- Setup: إنت في المخبز وعايز عيش للبيت.
- Cast: yassin · pool_f_2 (البياعة) · pool_m_3 (زبون قبله)
- Beats: ١. يستنى دوره. ٢. البياعة تقول مين عليه الدور. ٣. يطلب عيش بالعدد. ٤. "حاجة تانية؟" ويطلب حاجة صغيرة. ٥. السعر والدفع. ٦. شكراً وسلام.
- Moments: يسأل: العيش ده طازة النهارده؟ · يتسأل: عايز كيس؟

**03 · `perguntar-metro` · story · L1**
- Setup: إنت تايه في الشارع ومحتاج توصل للمترو.
- Cast: yassin · pool_m_1 (واحد ماشي)
- Beats: ١. يوقفه بأدب. ٢. يسأل فين أقرب مترو. ٣. الشرح: يمين، شمال، على طول، عند الإشارة. ٤. يكرر عشان يتأكد. ٥. قريب ولا بعيد، كام دقيقة مشي. ٦. شكراً.
- Moments: يسأل: ده الخط الصح لـ… (اسم محطة عامة زي "المحطة الرئيسية")؟ · يتسأل: إنت مش من هنا؟

**04 · `carregar-cartao` · story · L1**
- Setup: الكارت بتاع المواصلات خلص، وإنت في شباك التذاكر.
- Cast: yassin · pool_f_3 (الموظفة)
- Beats: ١. تحية. ٢. عايز يشحن الكارت. ٣. اشتراك شهري ولا رحلات. ٤. السعر. ٥. يدفع بالكارت البنكي. ٦. ياخد الكارت.
- Moments: يتسأل: معاك الكارت؟ · يسأل: ينفع أشحنه من المكنة المرة الجاية؟ · يتسأل: عايز وصل؟

### Level 2 · سهل

**05 · `supermercado-completo` · story · L2**
- Setup: إنت داخل السوبر ماركت ومعاك لستة حاجات للأسبوع.
- Cast: yassin · pool_m_2 (موظف في الممر) · pool_f_1 (قسم اللحوم الباردة) · pool_f_4 (الكاشير) · pool_m_3 (زبون معاه حاجة واحدة)
- Beats: ١. ياخد عربية ويبدأ بالخضار والفاكهة ويوزن. ٢. قسم اللحوم الباردة: ياخد رقم، "مين اللي عليه الدور؟"، يطلب كمية، "متقطّع؟"، "حاجة تانية؟". ٣. يسأل الموظف عن مكان حاجة. ٤. الطابور. ٥. الكاشير: كارت السوبر ماركت؟ رقم ضريبي على الفاتورة؟ كيس؟ ٦. يدفع بالكارت وياخد الوصل.
- Moments: يسأل: الحاجة دي خلصت؟ هتيجي إمتى؟ (للموظف) · يسأل: اتفضل عدّي (للزبون اللي معاه حاجة واحدة) · يتسأل: إنت آخر واحد في الطابور؟
- Notes: 3 scenes: fruit and deli, aisle, till.

**06 · `mercado-fruta` · story · L2**
- Setup: السبت الصبح في السوق، عايز خضار وفاكهة.
- Cast: yassin · pool_m_4 (البياع) · graca (جارة كبيرة بتشتري جنبه)
- Beats: ١. graca تسلّم عليه. ٢. يسأل سعر الكيلو. ٣. يختار ويطلب نص كيلو وكيلو. ٤. البياع يوزن ويقول الوزن. ٥. الحساب كاش والباقي. ٦. سلام لـgraca.
- Moments: يسأل: ممكن أدوق؟ · يتسأل: عايزهم للأكل النهارده ولا بعد كام يوم؟ · يسمع: graca بتفاصل مع البياع.

**07 · `farmacia-dor` · story · L2**
- Setup: زورك واجعك من امبارح ومحتاج حاجة بسرعة قبل الشغل.
- Cast: yassin · sofia (الصيدلانية)
- Beats: ١. يوصف الألم ومكانه. ٢. من إمتى. ٣. سخونية؟ كحة؟ ٤. حساسية من أي دوا؟ ٥. التوصية وطريقة الاستعمال (كل كام ساعة، أقصى عدد). ٦. نصيحة لو ما اتحسنش. ٧. السعر ورقم ضريبي. ٨. "ألف سلامة".
- Moments: يسأل: محتاج روشتة؟ · يسأل: فيه بديل أرخص؟ · يتسأل: بتاخد أي دوا تاني؟

**08 · `almoco-prato-do-dia` · story · L2**
- Setup: الغدا مع زميلتك في مطعم صغير جنب الشغل.
- Cast: yassin · ines (زميلة) · pool_m_1 (الجرسون)
- Beats: ١. يدخلوا ويطلبوا ترابيزة لاتنين. ٢. الجرسون يقول طبق اليوم. ٣. أسئلة عن الأكل. ٤. يطلبوا أكل ومشروب. ٥. الأكل يوصل. ٦. الحساب.
- Moments: يسأل: الأكل ده حار؟ · يسأل: فيه أوبشن نباتي؟ (ines هي اللي نباتية) · يسأل: ده فيه لحم خنزير؟ · يسأل: العيش والزيتون اللي على الترابيزة بفلوس؟ · يتسأل: كله تمام؟
- Notes: five moments on purpose. Each one stays 1–3 lines so the length still fits level 2.

### Level 3 · متوسط

**09 · `senhorio-chamada` · podcast · L3**
- Setup: شفت إعلان شقة على النت وبتتصل بصاحبها.
- Cast: yassin · carlos (صاحب الشقة)
- Beats: ١. يعرّف نفسه وبيتصل بخصوص الإعلان. ٢. لسه متاحة؟ ٣. الإيجار وإيه اللي داخل فيه (مصاريف العمارة، مية، كهربا). ٤. التأمين وكام شهر مقدم. ٥. ضامن. ٦. يتفقوا على ميعاد معاينة. ٧. الاسم والرقم.
- Moments: يسأل: فيه عقد وإيصالات؟ · يسأل: الشقة باردة في الشتا؟ · يتسأل: إنت شغال فين؟
- Notes: continues in episode 16.

**10 · `centro-saude-chamada` · podcast · L3**
- Setup: بتتصل بالمركز الصحي عشان تحجز ميعاد مع الدكتور.
- Cast: yassin · pool_f_2 (موظفة الاستقبال) · narrator (الرسالة المسجلة)
- Beats: ١. رسالة مسجلة. ٢. الموظفة ترد. ٣. رقم المريض. ٤. عايز ميعاد، والسبب باختصار. ٥. مستعجل ولا عادي. ٦. المواعيد المتاحة ويختار. ٧. تأكيد اليوم والساعة.
- Moments: يسمع: رسالة مسجلة "دوس ١…" · يتسأل: ممكن تتهجى اسمك؟ · يسأل: لو ما قدرتش آجي أعمل إيه؟

**11 · `encomenda-atrasada` · podcast · L3**
- Setup: طلبت حاجة أونلاين من أسبوع ولسه ما وصلتش، وبتكلم خدمة العملاء.
- Cast: yassin · pool_m_2 (موظف خدمة العملاء) · narrator (رسالة الانتظار)
- Beats: ١. رسالة انتظار. ٢. الموظف يرد ويطلب رقم الطلب. ٣. يشرح المشكلة. ٤. الموظف يدوّر. ٥. سبب التأخير. ٦. الحلول: ميعاد جديد أو فلوسه ترجع. ٧. يختار، وتأكيد بالإيميل.
- Moments: يتسأل: ممكن تأكد الإيميل؟ · يسأل: ينفع يسيبوه عند الجيران لو مش موجود؟ · يتسأل: ممكن تكرر رقم الطلب؟

**12 · `ginasio-dia` · story · L3**
- Setup: يوم عادي في الجيم بعد الشغل، والجيم زحمة.
- Cast: yassin · tiago (واحد بيتمرن) · pool_f_3 (المدربة) · pool_m_4 (واحد تاني بيتمرن)
- Beats: ١. اللوكرز. ٢. تسخين. ٣. يروح لجهاز عليه حد. ٤. يشاركوا الجهاز. ٥. الأوزان الحرة. ٦. يخلّص ويسلّم.
- Moments: يسأل: فين اللوكرز، ومحتاج قفل؟ · يسأل: محتاج الوزن ده؟ · يسأل: ينفع أشاركك على الجهاز؟ · يسأل: باقيلك كام جولة؟ · يتسأل: خلصت من البنش؟ · يسمع: المدربة بتقول لحد يرجّع الأوزان مكانها.
- Notes: tu between people the same age is normal here. 3 scenes: lockers, machines, free weights.

### Level 4 · أصعب شوية

**13 · `banco-conta` · story · L4**
- Setup: عندك ميعاد في البنك عشان تفتح حساب.
- Cast: yassin · rita (موظفة البنك)
- Beats: ١. يوصل للميعاد. ٢. الورق المطلوب (باسبور، رقم ضريبي، إثبات عنوان، عقد شغل). ٣. أنواع الحسابات. ٤. المصاريف الشهرية. ٥. الكارت. ٦. الأبليكيشن والدفع بالموبايل. ٧. يمضي.
- Moments: يسأل: فيه حساب من غير مصاريف؟ · يتسأل: إنت ساكن هنا من إمتى؟ · يسأل: الكارت يوصل إمتى؟

**14 · `vizinhos-audios` · podcast · L4**
- Setup: الجارة اللي فوقك بعتتلك رسالة صوتية عن الدوشة امبارح بالليل.
- Cast: yassin · graca (الجارة)
- Beats: ١. رسالة graca: مؤدبة بس زعلانة. ٢. يرد يعتذر ويشرح (عيد ميلاد صاحبه). ٣. ترد إنها فهمت، بس عندها شغل بدري. ٤. يتفقوا على ساعة معينة. ٥. رسالة أخيرة ودودة (عزومة على قهوة أو حلويات).
- Moments: يتسأل: الغسالة بتشتغل بالليل؟ · يسأل: لو فيه أي حاجة قوليلي على طول · يسمع: جار تاني اشتكى كمان.
- Notes: every line is a voice message, so lines are longer than a live dialogue.

**15 · `mecanico-barulho` · story · L4**
- Setup: العربية بتطلّع صوت غريب، وإنت عند الميكانيكي.
- Cast: yassin · pool_m_3 (الميكانيكي)
- Beats: ١. يوصف الصوت (إمتى، لما يفرمل ولا لما يلف). ٢. الميكانيكي يجرّب. ٣. التشخيص. ٤. التكلفة والمدة. ٥. يسيب العربية. ٦. يتفقوا يتصل بيه.
- Moments: يسأل: هيكلف كام تقريباً قبل ما تبدأ؟ · يتسأل: آخر صيانة إمتى؟ · يسأل: أقدر أسوقها كده لحد ما تتصلح؟

**16 · `visita-apartamento` · story · L4**
- Setup: ميعاد المعاينة مع صاحب الشقة اللي كلمته (حلقة ٩).
- Cast: yassin · carlos (صاحب الشقة)
- Beats: ١. يتقابلوا على الباب. ٢. الأوض والمطبخ والأجهزة. ٣. التدفئة والمية السخنة. ٤. العقد: المدة، التأمين، كام شهر مقدم، الضامن. ٥. الخطوة الجاية والورق.
- Moments: يسأل: الجيران هاديين؟ · يسأل: ينفع أدهن الحيطة؟ · يتسأل: فيه حد تاني هيسكن معاك؟ · يسمع: carlos بيرد على تليفون من حد تاني عايز يشوف الشقة.

### Level 5 · صعب

**17 · `amigos-rendas` · podcast · L5**
- Setup: إنت سامع اتنين صحاب بيتكلموا عن الإيجارات في المدينة.
- Cast: ines · tiago (no learner)
- Beats: ١. tiago بيدوّر على شقة ومتضايق. ٢. الأسعار في الأحياء المختلفة. ٣. أوضة في شقة مشتركة ولا شقة لوحده. ٤. المسافة للشغل والمواصلات. ٥. ines تحكي إزاي لقت شقتها. ٦. يتفقوا على خطة.
- Moments: صاحب بيت عايز كاش من غير عقد · فواتير الكهربا في الشتا · tiago يسأل لو ينفع يقعد عند ines كام يوم.

**18 · `entrevista-trabalho` · podcast · L5**
- Setup: إنترفيو شغل أونلاين بالفيديو.
- Cast: yassin · pool_f_4 (مسؤولة التوظيف)
- Beats: ١. التعارف. ٢. يقدّم نفسه وخبرته. ٣. ليه البرتغال. ٤. مستوى البرتغالي (بصراحة). ٥. المرتب المتوقع. ٦. أسئلته هو عن الفريق والشغل. ٧. الخطوات الجاية.
- Moments: يتسأل: سامعني؟ الصوت بيقطع · يتسأل: تقدر تبدأ إمتى؟ · يسأل: ينفع جزء من الشغل من البيت؟

**19 · `fim-de-semana` · podcast · L5**
- Setup: يوم الاتنين الصبح في الشغل، وزميلتك بتسألك عملت إيه في الويك إند.
- Cast: yassin · ines (زميلة) · carlos (زميل بيدخل في الكلام)
- Beats: ١. ines تسأل. ٢. يحكي عمل إيه (ماضي كتير). ٣. هي تحكي يومها. ٤. carlos يدخل ويحكي حاجة حصلتله. ٥. يتكلموا عن الويك إند الجاي.
- Moments: يتسأل: لسه ما جربتش … (أكلة أو مكان عام)؟ · يسأل: ينفع أنضم معاكم المرة الجاية؟ · يسمع: carlos بيدخل في الكلام فجأة.
- Notes: the main grammar load here is past tenses (pretérito and imperfeito together).

**20 · `eletricidade-fatura` · podcast · L5**
- Setup: فاتورة الكهربا جت عالية جداً، وبتتصل بالشركة.
- Cast: yassin · pool_m_1 (الموظف) · pool_f_2 (موظفة القسم التاني) · narrator (الرسالة المسجلة)
- Beats: ١. رسالة مسجلة. ٢. التحقق: الرقم الضريبي والعنوان. ٣. يشرح إن الفاتورة عالية. ٤. الموظف يشرح إن القراية تقديرية. ٥. يتحوّل لقسم تاني. ٦. يدّي قراية العداد الحقيقية. ٧. تقسيط أو فاتورة جديدة. ٨. يسأل عن عرض أرخص.
- Moments: يسمع: المكالمة بتتحول لقسم تاني · يتسأل: ممكن تديني رقم العداد؟ · يسأل: ينفع أقسّط؟

---

## 4. Order in the library

Within each level, the order above is the starting order; Omar reorders in admin. Episodes 9 and 16 are linked: 16 shows "تكملة: مكالمة مع صاحب الشقة" under its title.

## 5. Checklist for Omar

- ☐ Fill §1 (model, format, cap, speeds, 11 cast voices, 8 pool voices) after the pt-PT ear test.
- ☐ Read §3 and change anything that doesn't feel real; add `must_say` where you know the exact phrase.
- ☐ Add moments you meet in real life to §2 over time.
