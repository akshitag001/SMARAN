import type { Lang } from './types';

/**
 * Recurring classroom themes. Each theme knows:
 *  - how to spot it in a mentor's raw note (`observe`), for the on-phone drafter
 *  - how to recognise a written suggestion about it (`suggest`), for cluster patterns
 *  - a default suggestion in English and Hindi
 *  - how to describe it when it shows up across many schools
 */
export interface Theme {
  id: string;
  kind: 'concern' | 'strength';
  observe?: RegExp;
  suggest?: RegExp;
  action?: Record<Lang, { do: string; how: string }>;
  pattern: { title: string; body: string };
}

export const THEMES: Theme[] = [
  {
    id: 'girls',
    kind: 'concern',
    observe: /(girls|only boys|लड़कियाँ|लड़कियां)/i,
    suggest: /(girl|लड़की)/i,
    action: {
      en: { do: 'Take answers from a girl and a boy in turn.', how: 'When you ask a question, alternate between girls and boys. In pair work, ask the girl in each pair to explain first.' },
      hi: { do: 'जवाब बारी बारी से एक लड़की और एक लड़के से लें।', how: 'सवाल पूछते समय लड़कियों और लड़कों से बारी बारी से जवाब लें। जोड़ी में काम हो तो पहले लड़की से समझाने को कहें।' },
    },
    pattern: { title: 'Girls answer far less than boys', body: 'In these classes, boys take most of the turns to answer and girls rarely speak. Mentors have suggested taking answers from girls and boys in turn.' },
  },
  {
    id: 'names',
    kind: 'concern',
    observe: /(same (few |\d+ )?(kids|children|students)|front (row|rows|two|kids|children)|in front|only (\d|two|three|few) (strong )?(kids|children)|volunteer|back rows?|back ?bench|आगे के|पीछे वाले|चुप)/i,
    suggest: /(by name|every row|volunteer|turn to read|every child .*turn|tick list|नाम लेकर)/i,
    action: {
      en: { do: 'Call on children by name from every row, not only volunteers.', how: 'Tell the class you will choose who answers, then pick from the back and middle rows. Keep a small tick list so every child gets a turn this week.' },
      hi: { do: 'हर पंक्ति से बच्चों का नाम लेकर पूछें, सिर्फ़ हाथ उठाने वालों से नहीं।', how: 'कक्षा को बताएँ कि जवाब देने वाले बच्चे आप चुनेंगे, फिर पीछे और बीच की पंक्ति से नाम लें। एक छोटी सूची रखें ताकि इस हफ़्ते हर बच्चे की बारी आए।' },
    },
    pattern: { title: 'Answers come from the same few children', body: 'Teachers mostly take answers from volunteers in the front rows, and children at the back rarely speak. The suggestion given most often was to call on children by name across every row.' },
  },
  {
    id: 'check',
    kind: 'concern',
    observe: /(understood\??|समझ आया|didn.?t check|not check|everyone said yes)/i,
    suggest: /(understood|at the same time|at once|quick question|एक साथ)/i,
    action: {
      en: { do: 'Replace “understood?” with one quick question everyone answers.', how: 'Ask a short question and have all children show the answer at once, on slates or with fingers, so you can see who needs help.' },
      hi: { do: '“समझ आया?” की जगह एक छोटा सवाल पूछें जिसका जवाब सब दें।', how: 'एक छोटा सवाल पूछें और सभी बच्चों से एक साथ स्लेट या उँगलियों पर जवाब दिखवाएँ, ताकि पता चले किसे मदद चाहिए।' },
    },
    pattern: { title: 'Understanding is not checked before moving on', body: 'Lessons move ahead after asking “understood?”, and the whole class says yes. Mentors have suggested one quick question that every child answers on a slate.' },
  },
  {
    id: 'pace',
    kind: 'concern',
    observe: /(rush|too fast|still fast|fast|quick|hurr|जल्दी)/i,
    suggest: /(slates?|similar (one|sum)|board example|स्लेट)/i,
    action: {
      en: { do: 'After each board example, let children try a similar one on slates.', how: 'Write one similar sum, give a minute, and have everyone hold up their slates. If fewer than half are right, do one more example together.' },
      hi: { do: 'बोर्ड पर हर उदाहरण के बाद बच्चों से स्लेट पर वैसा ही एक सवाल करवाएँ।', how: 'एक मिलता जुलता सवाल लिखें, एक मिनट दें, फिर सबसे स्लेट ऊपर करवाएँ। आधे से कम सही हों तो एक और उदाहरण साथ में करें।' },
    },
    pattern: { title: 'Board examples move faster than children can follow', body: 'Teachers work through several examples without checking slates in between, so children who are lost are not noticed until the written work.' },
  },
  {
    id: 'handson',
    kind: 'concern',
    observe: /(no child|themselves|hands.?on|खुद करके)/i,
    suggest: /(themselves|handle|try the activity|खुद करके)/i,
    action: {
      en: { do: 'Let children try the activity themselves in small groups.', how: 'After your demonstration, give each group of four or five children the material to try, and ask one child from each group to say what they saw.' },
      hi: { do: 'बच्चों को छोटे समूहों में गतिविधि खुद करके देखने दें।', how: 'आपके दिखाने के बाद चार पाँच बच्चों के हर समूह को सामग्री दें, और हर समूह से एक बच्चा बताए कि उन्होंने क्या देखा।' },
    },
    pattern: { title: 'Children watch demonstrations but rarely try them', body: 'Teachers demonstrate well, but children do not get to handle the materials themselves.' },
  },
  {
    id: 'books',
    kind: 'concern',
    observe: /(started late|start(ed)? late|late start|from the office|देर से)/i,
    suggest: /(on time|so class starts)/i,
    action: {
      en: { do: 'Keep books in the classroom so class starts on time.', how: 'Ask for a cupboard or a trunk in the classroom and keep the week’s workbooks there, so no time goes in fetching them from the office.' },
      hi: { do: 'किताबें कक्षा में ही रखें ताकि कक्षा समय पर शुरू हो।', how: 'कक्षा में एक अलमारी या बक्सा रखें और हफ़्ते की कार्यपुस्तिकाएँ वहीं रखें, ताकि दफ़्तर से लाने में समय न जाए।' },
    },
    pattern: { title: 'Classes start late while books are fetched', body: 'Workbooks are kept in the office, and classes lose the first 10 to 15 minutes while they are brought in.' },
  },
  {
    id: 'materials',
    kind: 'concern',
    observe: /(not used|cupboard|अलमारी|इस्तेमाल नहीं)/i,
    suggest: /(material|letter.?cards?|kit|print-rich|reach)/i,
    action: {
      en: { do: 'Keep learning materials within children’s reach and use them daily.', how: 'Put the letter cards or kit items in a basket on the floor, and start each class with a five-minute activity using them.' },
      hi: { do: 'सीखने की सामग्री बच्चों की पहुँच में रखें और रोज़ इस्तेमाल करें।', how: 'अक्षर कार्ड या किट की चीज़ें ज़मीन पर एक टोकरी में रखें, और हर कक्षा की शुरुआत पाँच मिनट की गतिविधि से करें।' },
    },
    pattern: { title: 'Learning materials are kept away instead of used', body: 'FLN kit items and letter cards are in the school but stay in cupboards during lessons.' },
  },
  {
    id: 'levels',
    kind: 'concern',
    observe: /(weak|level|group|mostly listened|कमज़ोर|कमजोर|समूह|स्तर)/i,
    suggest: /(level|group|समूह|स्तर)/i,
    action: {
      en: { do: 'Spend 15 minutes daily in level-wise groups.', how: 'Make groups from the last reading or number check. Give each group a task at its level and sit with the group that needs you most.' },
      hi: { do: 'रोज़ 15 मिनट स्तर के हिसाब से समूहों में काम करवाएँ।', how: 'पिछली जाँच के आधार पर समूह बनाएँ। हर समूह को उसके स्तर का काम दें और सबसे ज़्यादा मदद वाले समूह के साथ बैठें।' },
    },
    pattern: { title: 'Level-wise groups started, then stopped', body: 'Groups were set up after the FLN training, but these classes are back to whole-class teaching. A refresher at the cluster meeting may help more than school-by-school advice.' },
  },
  {
    id: 'notebooks',
    kind: 'concern',
    observe: /(notebook|copies|कॉपी)/i,
    suggest: /(notebook|कॉपी)/i,
    action: {
      en: { do: 'Check five notebooks a day with one line of feedback each.', how: 'Pick five notebooks each day, write one line in each, and return them the next morning. Every child is covered within a fortnight.' },
      hi: { do: 'रोज़ पाँच कॉपियाँ जाँचें और हर एक में एक पंक्ति लिखें।', how: 'हर दिन पाँच कॉपियाँ लें, हर एक में एक पंक्ति लिखें और अगली सुबह लौटा दें। दो हफ़्ते में हर बच्चे की कॉपी देख ली जाएगी।' },
    },
    pattern: { title: 'Notebooks go unchecked for weeks', body: 'Written work is not being looked at regularly, so mistakes repeat without anyone noticing.' },
  },
  {
    id: 'lecture',
    kind: 'concern',
    observe: /(from (the )?book|lecture|copying|reading from|किताब से)/i,
    suggest: /(pair|partner|discussion|own village|textbook|जोड़ी)/i,
    action: {
      en: { do: 'Break long textbook reading with two minutes of pair talk.', how: 'After each page, ask children to tell a partner one thing they learned, then take two answers from different parts of the room.' },
      hi: { do: 'किताब से लंबे पढ़ाने के बीच दो मिनट जोड़ी में बातचीत करवाएँ।', how: 'हर पन्ने के बाद बच्चे अपने साथी को एक सीखी हुई बात बताएँ, फिर कक्षा के अलग अलग हिस्सों से दो जवाब लें।' },
    },
    pattern: { title: 'Lessons are mostly read from the textbook', body: 'Much of the lesson is reading aloud from the book, with little discussion or connection to the children’s own surroundings.' },
  },
  {
    id: 'tlm',
    kind: 'strength',
    // Spotted in what worked, not in suggestions.
    observe: /(stick|bundle|number card|letter card|tlm|kit|map|चार्ट|तीलि|बंडल)/i,
    pattern: { title: 'Kit materials are in regular use', body: 'Stick bundles, number cards and other FLN kit materials are being used at the start of lessons. This could be shown at the next cluster meeting as practice that is working.' },
  },
];

export const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** Which concern a written suggestion is about, if any. */
export function classifySuggestion(text: string): string | null {
  for (const t of THEMES) {
    if (t.kind === 'concern' && t.suggest?.test(text)) return t.id;
  }
  return null;
}

/** Whether a "what worked" line names a strength we track across schools. */
export function strengthThemes(text: string): string[] {
  return THEMES.filter((t) => t.kind === 'strength' && t.observe?.test(text)).map((t) => t.id);
}
