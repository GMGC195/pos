// ================= ITEM URDU TRANSLATOR / CLEANER FOR FRONTEND =================
export const ITEM_URDU_MAP = {
  'garlic bread': 'گارلک بریڈ',
  'chicken biryani': 'مرغ بریانی',
  'mutton biryani': 'مٹن بریانی',
  'beef biryani': 'بیف بریانی',
  'veg biryani': 'سبزی بریانی',
  'chicken karahi': 'مرغ کڑاہی',
  'mutton karahi': 'مٹن کڑاہی',
  'chicken handi': 'مرغ ہانڈی',
  'chicken jalfrezi': 'مرغ جلفریزی',
  'chicken tikka': 'مرغ تکہ',
  'chicken boti': 'مرغ بوٹی',
  'chicken kabab': 'مرغ کباب',
  'seekh kabab': 'سیخ کباب',
  'reshmi kabab': 'ریشمی کباب',
  'chicken roast': 'مرغ روسٹ',
  'chicken broast': 'مرغ بروسٹ',
  'chicken burger': 'مرغ برگر',
  'beef burger': 'بیف برگر',
  'zinger burger': 'زنگر برگر',
  'chicken shawarma': 'مرغ شوارما',
  'chicken roll': 'مرغ رول',
  'paratha roll': 'پراٹھا رول',
  'french fries': 'فرینچ فرائز',
  'loaded fries': 'لوڈڈ فرائز',
  'cheese pizza': 'چیز پیزا',
  'chicken pizza': 'مرغ پیزا',
  'fajita pizza': 'فجیتا پیزا',
  'tikka pizza': 'تکہ پیزا',
  'bbq pizza': 'بی بی کیو پیزا',
  'pepperoni pizza': 'پیپرونی پیزا',
  'pepperoni supreme': 'پیپرونی سپریم پیزا',
  'margherita classic': 'مارگریٹا کلاسک پیزا',
  'four cheese': 'فور چیز پیزا',
  'veggie garden': 'ویجی گارڈن پیزا',
  'meat lovers': 'میٹ لورز پیزا',
  'bbq chicken feast': 'بی بی کیو مرغ پیزا',
  'family feast deal': 'فیملی فیسٹ ڈیل',
  'couple combo': 'کپل کومبو ڈیل',
  'gol gappy': 'گول گپے',
  'gol gappy (l)': 'گول گپے (L)',
  'mineral water': 'منرل واٹر',
  'water': 'منرل واٹر',
  'coca-cola 500ml': 'کوکا کولا 500 ملی',
  'coca-cola': 'کوکا کولا',
  'fresh lemonade': 'تازہ لیمونیڈ',
  'mango smoothie': 'مینگو سموتھی',
  'mint margarita': 'منٹ مارگریٹا',
  'cold drink': 'کولڈ ڈرنک',
  'karak chai': 'کڑک چائے',
  'green tea': 'سبز چائے',
  'garlic naan': 'گارلک نان',
  'cheese naan': 'چیز نان',
  'chicken wings': 'مرغ ونگز',
  'biryani': 'بریانی',
  'burger': 'برگر',
  'zinger': 'زنگر',
  'shawarma': 'شوارما',
  'roll': 'رول',
  'fries': 'فرائز',
  'pizza': 'پیزا',
  'margherita': 'مارگریٹا پیزا',
  'coke': 'کوک',
  'pepsi': 'پیپسی',
  '7up': 'سیون اپ',
  'sprite': 'سپرائٹ',
  'raita': 'رائتہ',
  'salad': 'سلاد',
  'roti': 'روٹی',
  'naan': 'نان',
  'paratha': 'پراٹھا',
  'nuggets': 'نگیٹس',
  'wings': 'ونگز'
};

export const WORD_MAP = [
  [/chicken/i, 'مرغ'],
  [/garlic bread/i, 'گارلک بریڈ'],
  [/garlic/i, 'گارلک'],
  [/bread/i, 'بریڈ'],
  [/biryani/i, 'بریانی'],
  [/karahi/i, 'کڑاہی'],
  [/handi/i, 'ہانڈی'],
  [/jalfrezi/i, 'جلفریزی'],
  [/tikka/i, 'تکہ'],
  [/boti/i, 'بوٹی'],
  [/kabab/i, 'کباب'],
  [/kebab/i, 'کباب'],
  [/zinger/i, 'زنگر'],
  [/burger/i, 'برگر'],
  [/shawarma/i, 'شوارما'],
  [/pizza/i, 'پیزا'],
  [/fries/i, 'فرائز'],
  [/roll/i, 'رول'],
  [/sandwich/i, 'سینڈوچ'],
  [/nuggets/i, 'نگیٹس'],
  [/wings/i, 'ونگز'],
  [/mutton/i, 'مٹن'],
  [/beef/i, 'بیف'],
  [/fish/i, 'مچھلی'],
  [/cheese/i, 'چیز'],
  [/water/i, 'منرل واٹر'],
  [/deal/i, 'ڈیل'],
  [/special/i, 'اسپیشل'],
  [/salad/i, 'سلاد'],
  [/sauce/i, 'ساس'],
  [/small/i, 'چھوٹا'],
  [/medium/i, 'درمیانہ'],
  [/large/i, 'بڑا']
];

export function formatItemUrdu(rawName) {
  if (!rawName) return '';
  let str = String(rawName).trim();

  // 1. Clean previous inverted Urdu phrases if present
  str = str.replace(/بریانی مرغ/g, 'مرغ بریانی');
  str = str.replace(/بریڈ گارلک/g, 'گارلک بریڈ');
  str = str.replace(/کڑاہی مرغ/g, 'مرغ کڑاہی');
  str = str.replace(/ہانڈی مرغ/g, 'مرغ ہانڈی');
  str = str.replace(/تکہ مرغ/g, 'مرغ تکہ');
  str = str.replace(/بوٹی مرغ/g, 'مرغ بوٹی');
  str = str.replace(/کباب مرغ/g, 'مرغ کباب');
  str = str.replace(/قورمہ مرغ/g, 'مرغ قورمہ');
  str = str.replace(/پلاؤ مرغ/g, 'مرغ پلاؤ');
  str = str.replace(/شوارما مرغ/g, 'مرغ شوارما');
  str = str.replace(/بروسٹ مرغ/g, 'مرغ بروسٹ');
  str = str.replace(/برگر مرغ/g, 'مرغ برگر');
  str = str.replace(/پیزا مرغ/g, 'مرغ پیزا');
  str = str.replace(/ونگز مرغ/g, 'مرغ ونگز');
  str = str.replace(/رول مرغ/g, 'مرغ رول');
  str = str.replace(/نان گارلک/g, 'گارلک نان');

  // 2. Replace Arabic phrases with proper Urdu (chicken = مرغ pehle)
  str = str.replace(/برياني دجاج/g, 'مرغ بریانی');
  str = str.replace(/دجاج برياني/g, 'مرغ بریانی');
  str = str.replace(/دجاج جالفريزي/g, 'مرغ جلفریزی');
  str = str.replace(/شواية دجاج/g, 'مرغ شواية');
  str = str.replace(/دجاج شواية/g, 'مرغ شواية');
  str = str.replace(/فحم دجاج/g, 'مرغ فحم');
  str = str.replace(/دجاج فحم/g, 'مرغ فحم');
  str = str.replace(/دجاج الفحم/g, 'مرغ الفحم');
  str = str.replace(/دجاج كراهي/g, 'مرغ کڑاہی');
  str = str.replace(/كراهي دجاج/g, 'مرغ کڑاہی');
  str = str.replace(/دجاج تكا/g, 'مرغ تکہ');
  str = str.replace(/تكا دجاج/g, 'مرغ تکہ');
  str = str.replace(/دجاج بوتي/g, 'مرغ بوٹی');
  str = str.replace(/هاندي دجاج/g, 'مرغ ہانڈی');
  str = str.replace(/دجاج هاندي/g, 'مرغ ہانڈی');
  str = str.replace(/كباب دجاج/g, 'مرغ کباب');
  str = str.replace(/دجاج كباب/g, 'مرغ کباب');
  str = str.replace(/دجاج كورما/g, 'مرغ قورمہ');
  str = str.replace(/كورما دجاج/g, 'مرغ قورمہ');
  str = str.replace(/بولاو دجاج/g, 'مرغ پلاؤ');
  str = str.replace(/دجاج بولاو/g, 'مرغ پلاؤ');
  str = str.replace(/حليم دجاج/g, 'مرغ حلیم');
  str = str.replace(/شوارما دجاج/g, 'مرغ شوارما');
  str = str.replace(/دجاج شوارما/g, 'مرغ شوارما');
  str = str.replace(/بروست دجاج/g, 'مرغ بروسٹ');
  str = str.replace(/دجاج بروست/g, 'مرغ بروسٹ');
  str = str.replace(/دجاج بالزبدة/g, 'بٹر چکن (مرغ)');
  str = str.replace(/دجاج مشوي/g, 'مرغ مشوی');
  str = str.replace(/دجاج/g, 'مرغ');
  str = str.replace(/لحم ضأن/g, 'مٹن');
  str = str.replace(/لحم/g, 'گوشت');
  str = str.replace(/أرز/g, 'چاول');
  str = str.replace(/الرز/g, 'چاول');
  str = str.replace(/ماء/g, 'پانی');
  str = str.replace(/نان الثوم/g, 'گارلک نان');

  let result = str;

  // If does not contain Urdu/Arabic characters, find Urdu equivalent
  if (!/[\u0600-\u06FF]/.test(str)) {
    const cleanKey = str.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    if (ITEM_URDU_MAP[cleanKey]) {
      result = `${str} - ${ITEM_URDU_MAP[cleanKey]}`;
    } else {
      const sortedKeys = Object.keys(ITEM_URDU_MAP).sort((a, b) => b.length - a.length);
      let matched = false;
      for (const k of sortedKeys) {
        if (k.includes(' ') && (cleanKey === k || cleanKey.includes(k))) {
          result = `${str} - ${ITEM_URDU_MAP[k]}`;
          matched = true;
          break;
        }
      }
      if (!matched) {
        let urduWords = [];
        for (const [regex, urdu] of WORD_MAP) {
          if (regex.test(str)) {
            urduWords.push(urdu);
          }
        }
        if (urduWords.length > 0) {
          result = `${str} - ${[...new Set(urduWords)].join(' ')}`;
        } else {
          for (const k of sortedKeys) {
            if (cleanKey.includes(k)) {
              result = `${str} - ${ITEM_URDU_MAP[k]}`;
              break;
            }
          }
        }
      }
    }
  }

  return result;
}

