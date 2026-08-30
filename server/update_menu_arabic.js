require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const translations = {
  // Breakfast Delights
  'Nihari Special': 'Nihari Special - نهاري خاص',
  'Mutton Paya': 'Mutton Paya - لحم الضأن بايا',
  'Halwa Puri Chana': 'Halwa Puri Chana - حلوى بوري شانا',
  'French Toast (4 pieces)': 'French Toast (4 pieces) - فرنش توست ٤ قطع',
  'Omelette': 'Omelette - عجة البيض',
  'Punjabi Lassi': 'Punjabi Lassi - الاسي البنجاب',
  'Tandoori Roti': 'Tandoori Roti - خبز التندوري',
  'Garlic Naan': 'Garlic Naan - نان الثوم',
  'Plain Naan': 'Plain Naan - نان عادي',
  'Butter Naan': 'Butter Naan - زبدة نان',
  'Aloo Naan': 'Aloo Naan - الو نان',
  'Keema Naan': 'Keema Naan - كيما نان',
  'Kalonji Naan': 'Kalonji Naan - كالونجي نان',
  'Sada Paratha': 'Sada Paratha - سادة باراتا',
  'Aloo Paratha': 'Aloo Paratha - الو باراتا',
  'Mooli Paratha': 'Mooli Paratha - مولي باراتا',

  // Bar BQ Smoke Spice
  'Chicken Malai Boti (3 Seekh)': 'Chicken Malai Boti (3 Seekh) - دجاج مالاي بوتي ٣ سيخ',
  'Sheesh Tauwq Boti (3 Seekh)': 'Sheesh Tauwq Boti (3 Seekh) - شيش طوق بوتي ٣ سيخ',
  'Chicken Tikka Boti (3 Seekh)': 'Chicken Tikka Boti (3 Seekh) - دجاج تيكا بوتي ٣ سيخ',
  'Green Bote (3 Seekh)': 'Green Bote (3 Seekh) - بوت أخضر ٣ سيخ',
  'Gulnar Bote (3 Seekh)': 'Gulnar Bote (3 Seekh) - جلنار بوت ٣ سيخ',
  'Chicken Boti Boneless (3 Seekh)': 'Chicken Boti Boneless (3 Seekh) - دجاج بوتي بدون عظم ٣ سيخ',
  'Beef Seekh Kabab (4 Seekh)': 'Beef Seekh Kabab (4 Seekh) - سيخ لحم بقري كباب ٤ سيخ',
  'Chicken Seekh Kabab (4 Seekh)': 'Chicken Seekh Kabab (4 Seekh) - سيخ كباب دجاج ٤ سيخ',
  'Bihari Kabab (4 Seekh)': 'Bihari Kabab (4 Seekh) - بيهاري كباب ٤ سيخ',
  'Rashmi Chicken Kabab 4 Seekh': 'Rashmi Chicken Kabab (4 Seekh) - راشمي دجاج كباب ٤ سيخ',
  'Fish Tikka': 'Fish Tikka - سمك تكا',
  'Chicken Tikka': 'Chicken Tikka - دجاج تكا',
  'Rawaq BBQ Platter': 'Rawaq BBQ Platter - طبق رواق للشواء',

  // Meats & Chicken
  'Mutton Karahi': 'Mutton Karahi - لحم الضأن كاراهي',
  'Mutton Korma': 'Mutton Korma - لحم الضأن كورما',
  'Mutton Badami Korma': 'Mutton Badami Korma - لحم ضأن بادامي كورما',
  'Mutton Achari': 'Mutton Achari - لحم ضأن أشاري',
  'Chicken Karahi Full': 'Chicken Karahi Full - دجاج كراهي كامل',
  'Chicken White Karahi': 'Chicken White Karahi - دجاج أبيض كراهي',
  'Chicken Korma': 'Chicken Korma - دجاج كورما',
  'Chicken Badami Korma': 'Chicken Badami Korma - دجاج بادام كورما',
  'Chicken Achari': 'Chicken Achari - دجاج أشاري',
  'Chicken Ginger': 'Chicken Ginger - دجاج بالزنجبيل',
  'Butter Chicken': 'Butter Chicken - دجاج بالزبدة',
  'Chicken Jalfrezi': 'Chicken Jalfrezi - دجاج جالفريزي',
  'Murgh Makhni Handi': 'Murgh Makhni Handi - مورغ مخني هاندي',
  'Chicken Handi': 'Chicken Handi - هاندي دجاج',
  'Beef Fry Masala': 'Beef Fry Masala - بهارات لحم البقر المقلية',

  // Biryani & Pulao
  'Al Shawaya - Grilled Chicken Without Rice': 'Al Shawaya - Grilled Chicken Without Rice - الشواية دجاج مشوي بدون أرز',
  'Al Shawaya - Grilled Chicken With Rice': 'Al Shawaya - Grilled Chicken With Rice - الشواية دجاج مشوي مع أرز',
  'Al-Faham Chicken On Coal Without Rice': 'Al-Faham Chicken On Coal Without Rice - دجاج الفحم على الفحم بدون أرز',
  'Al-Faham Chicken On Coal With Rice': 'Al-Faham Chicken On Coal With Rice - دجاج الفحم على الفحم مع أرز',
  'Bukhari Rice': 'Bukhari Rice - أرز بخاري',
  'Mutton Pulao': 'Mutton Pulao - بولاو لحم ضأن',
  'Mutton Biryani': 'Mutton Biryani - برياني لحم ضأن',
  'Chicken Biryani': 'Chicken Biryani - برياني دجاج',
  'Chicken Pulao': 'Chicken Pulao - بولاو دجاج',
  'Biryani Rice': 'Biryani Rice - أرز برياني',

  // Sweet & Salty
  'Samosa Pakistani': 'Samosa Pakistani - سمبوسة باكستانية',
  'Dahi Bhallay': 'Dahi Bhallay - داهي بهالاي',
  'Fruit Chaat': 'Fruit Chaat - شات الفاكهة',
  'Gulab Jamun (KG)': 'Gulab Jamun - جولاب جامون',
  'Jalebi (KG)': 'Jalebi - جاليبي',
  'Rasmalai': 'Rasmalai - رسملي',
  'Sohan Halwa, Khajoor Halwa Etc': 'Sohan Halwa, Khajoor Halwa - سوهان حلوة، خاجور حلوة',
  'Pakory (KG)': 'Pakory - باكوري',
  'Pateesay (KG)': 'Pateesay - باتيسي',
  'Mix Pakistani Sweets (KG)': 'Mix Pakistani Sweets - حلويات باكستانية مشكلة',
  'Gajrela (KG)': 'Gajrela - جاجريلا',
  'Rabri Milk': 'Rabri Milk - حليب رابري',
  'French Fries': 'French Fries - بطاطس مقلية',
  'Sweet Kheer': 'Sweet Kheer - خير حلو',

  // Beverages
  'Water 330ml': 'Water 330ml - ماء ٣٣٠ مل',
  'Shani Soft Drink': 'Shani Soft Drink - مشروب شاني الغازي',
  'Lemon Mint': 'Lemon Mint - ليمون بالنعناع',
  'Linda Citrus Drink': 'Linda Citrus Drink - مشروب ليندا الحمضيات',
  'Mango Shake': 'Mango Shake - ميلك شيك مانجو',
  'Very Berry Smoothie': 'Very Berry Smoothie - سموثي التوت',
  'Linda Orange Drink': 'Linda Orange Drink - مشروب ليندا بالبرتقال',
  'Mirinda Citrus 245ml': 'Mirinda Citrus 245ml - ميرندا الحمضيات ٢٤٥ مل',
  'Mirinda Citrus 320ml': 'Mirinda Citrus 320ml - ميرندا الحمضيات ٣٢٠ مل',
  'Pepsi 245ml': 'Pepsi 245ml - بيبسي ٢٤٥ مل',
  'Pepsi 320ml': 'Pepsi 320ml - بيبسي ٣٢٠ مل',
  'Kinza Cola 320ml': 'Kinza Cola 320ml - كينزا كولا ٣٢٠ مل',
  '7UP 245ml': '7UP 245ml - سفن أب ٢٤٥ مل',
  'Mountain Dew 245ml': 'Mountain Dew 245ml - ماونتن ديو ٢٤٥ مل',
  'Mountain Dew 320ml': 'Mountain Dew 320ml - ماونتن ديو ٣٢٠ مل',
  'Sting Energy Drink Can': 'Sting Energy Drink Can - مشروب طاقة ستينغ علبة',
  'Sting Energy Drink Bottle': 'Sting Energy Drink Bottle - مشروب طاقة ستينغ زجاجة',
  'Kinza Orange 320ml': 'Kinza Orange 320ml - كينزا برتقال ٣٢٠ مل',
  'Almarai Alphonsa Flavoured Mango Milk 225ml': 'Almarai Mango Milk - حليب المراعي ألفونسا بنكهة المانجو',
  'Almarai Full Fat Fresh Laban 360ml': 'Almarai Fresh Laban 360ml - لبن المراعي كامل الدسم ٣٦٠ مل',
  'Almarai Full Fat Fresh Laban 180ml': 'Almarai Fresh Laban 180ml - المراعي كامل الدسم لبن طازج ١٨٠ مل',
  'Almarai Double Chocolate Milk 225ml': 'Almarai Chocolate Milk 225ml - حليب المراعي بنكهة الشوكولاتة',
  'Almarai Full Fat Fresh Laban 1L': 'Almarai Fresh Laban 1L - لبن المراعي كامل الدسم ١ لتر',
  'Almarai Strawberry Laban': 'Almarai Strawberry Laban - لبن المراعي بالفراولة',
  'Almarai Full Fat Fresh Milk 1L': 'Almarai Fresh Milk 1L - حليب المراعي كامل الدسم ١ لتر',
  'Almarai Plain Full Fat Yogurt': 'Almarai Plain Yogurt - زبادي المراعي سادة كامل الدسم',

  // Veggie & Lentil Treats
  'Haleem Chicken': 'Haleem Chicken - حليم دجاج',
  'Al Rawaq Special Dal': 'Al Rawaq Special Dal - الرواق الخاص دال',
  'Murga Chana': 'Murga Chana - مورجا شانا',
  'Dal Tadka': 'Dal Tadka - دال تادكا',
  'Chana Egg': 'Chana Egg - بيض شانا',
  'Kari Pakora': 'Kari Pakora - كاري باكورا',
  'Dal Mash': 'Dal Mash - دال ماش',
  'Dal Chana': 'Dal Chana - دال شانا',
  'Chana': 'Chana - شانا',
  'Karelay Gosht Mutton': 'Karelay Gosht Mutton - كارلاي جوشت لحم الضأن',
  'Matar Keema': 'Matar Keema - مطر كيما',
  'Bhindi Steam': 'Bhindi Steam - بخار هندي',
  'Bhindi Masala': 'Bhindi Masala - بهندي ماسالا',
  'Saag Makhni': 'Saag Makhni - ساج مخني',
  'Aloo Palak': 'Aloo Palak - ألو بالاك',
  'Palak Paneer': 'Palak Paneer - بالاك بانير',
  'Mix Vegetable': 'Mix Vegetable - مزيج الخضار',
  'Aloo Matar Gajar Methi': 'Aloo Matar Gajar Methi - ألو مطر جاجار ميثي'
};

async function updateMenu() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const [english, translated] of Object.entries(translations)) {
      await client.query(
        'UPDATE items SET name = $1 WHERE name ILIKE $2 OR name ILIKE $3',
        [translated, english, english + ' %']
      );
    }
    
    // Some that might not match perfectly from seed
    await client.query("UPDATE items SET name = 'Rashmi Chicken Kabab (4 Seekh) - راشمي دجاج كباب ٤ سيخ' WHERE name ILIKE '%Rashmi%'");
    await client.query("UPDATE items SET name = 'Sohan Halwa, Khajoor Halwa - سوهان حلوة، خاجور حلوة' WHERE name ILIKE '%Sohan Halwa%'");
    
    // Append sizes to translated names so we don't just replace them blindly if they had sizes
    
    await client.query('COMMIT');
    console.log('✅ Menu items updated with Arabic translations!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Update failed:', err);
  } finally {
    client.release();
  }
}

updateMenu();
