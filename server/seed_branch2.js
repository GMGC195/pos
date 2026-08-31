require('dotenv').config();
const pool = require('./db');

const itemsToSeed = [
  { shortCode: 'SA1', title: 'Omelette عجّة البيض', category: 'Breakfast', price: 3 },
  { shortCode: 'SA2', title: 'Egg Fry بيض مقلي 2', category: 'Breakfast', price: 2 },
  { shortCode: 'SA3', title: 'Halwa Puri Channa حلوى بوري', category: 'Breakfast', price: 18 },
  { shortCode: 'SA4', title: 'Nihari Special نهاري خاص لحم', category: 'Breakfast', price: 18 },
  { shortCode: 'SA5', title: 'Paya Mutton طبق بايا', category: 'Breakfast', price: 15 },
  { shortCode: 'SA6', title: 'Punjabi Lassi لاسي بنجابية', category: 'Breakfast', price: 8 },
  { shortCode: 'SA7', title: 'Aloo Paratha ألو باراتا', category: 'Breakfast', price: 3 },
  { shortCode: 'SA8', title: 'Sada Paratha عادي باراتا', category: 'Breakfast', price: 1 },
  { shortCode: 'SA9', title: 'Chana شانا', category: 'Breakfast', price: 8 },
  { shortCode: 'SA10', title: 'Tea 2 شاي', category: 'Breakfast', price: 2 },
  { shortCode: 'SA11', title: 'Tea 3 شاي', category: 'Breakfast', price: 3 },
  { shortCode: 'NSA10', title: 'Tea 1 شاي', category: 'Breakfast', price: 1 },
  { shortCode: 'SA12', title: 'Egg Paratha اندے پراتا + براتا البيض', category: 'Breakfast', price: 4 },
  { shortCode: 'SA13', title: 'Egg Chana 10 بيض شانا', category: 'Breakfast', price: 12 },
  { shortCode: 'SA14', title: 'Lachha Paratha 2 الحشة باراتا', category: 'Breakfast', price: 3 },
  { shortCode: 'SA15', title: 'Boiled Egg بيض مسلوق', category: 'Breakfast', price: 1 },
  { shortCode: 'SA110', title: 'Omelette 2 eggs أومليت ٢ بيض عجة البيض', category: 'Breakfast', price: 5 },
  { shortCode: 'SA57', title: 'Tandoori Roti تندوري روتي', category: 'BREADS', price: 0.5 },
  { shortCode: 'SA58', title: 'Butter Naan زبدة نان', category: 'BREADS', price: 3 },
  { shortCode: 'SA16', title: 'Chicken Faham Full فحم دجاج', category: 'Saudi special food', price: 30 },
  { shortCode: 'SA17', title: 'Chicken Faham 1/2 فحم دجاج', category: 'Saudi special food', price: 15 },
  { shortCode: 'SA18', title: 'Chicken Faham 1/4 فحم دجاج', category: 'Saudi special food', price: 10 },
  { shortCode: 'SA19', title: 'Chicken Faham Full + Bukhari Rice فحم دجاج + رز البخاري', category: 'Saudi special food', price: 40 },
  { shortCode: 'SA20', title: 'Chicken Faham 1/2 Bukhari Rice فحم دجاج الرز البخاري', category: 'Saudi special food', price: 20 },
  { shortCode: 'SA21', title: 'Chicken Faham 1/4 + Bukhari Rice فحم دجاج الرز البخاري', category: 'Saudi special food', price: 12 },
  { shortCode: 'SA22', title: 'Chicken Shawaya Full شواية دجاج', category: 'Saudi special food', price: 30 },
  { shortCode: 'SA23', title: 'Chicken Shawaya 1/2 شواية دجاج', category: 'Saudi special food', price: 15 },
  { shortCode: 'SA24', title: 'Chicken Shawaya 1/4 شواية دجاج', category: 'Saudi special food', price: 8 },
  { shortCode: 'SA25', title: 'Chicken Shawaya Full + Rice شواية دجاج الرز', category: 'Saudi special food', price: 40 },
  { shortCode: 'SA26', title: 'Chicken Shawaya 1/2 + Rice شواية دجاج الرز', category: 'Saudi special food', price: 20 },
  { shortCode: 'SA27', title: 'Chicken Shawaya 1/4 + Rice شواية دجاج الرز', category: 'Saudi special food', price: 10 },
  { shortCode: 'SA28', title: 'Bukhari Rice الرز البخاري', category: 'Saudi special food', price: 6 },
  { shortCode: 'Ch11', title: 'Chicken Faham 1/4 فحم دجاج', category: 'Saudi special food', price: 11 },
  { shortCode: 'SA47', title: 'Rawaq Bbq Plater صحن رواق للشواء', category: 'BBQs', price: 45 },
  { shortCode: 'SA48', title: 'Chicken Malai Boti دجاج مالاي بوتي', category: 'BBQs', price: 20 },
  { shortCode: 'SA49', title: 'Sheesh Tao Boti شيش طوق بوني', category: 'BBQs', price: 20 },
  { shortCode: 'SA50', title: 'Chicken Tikka Boti دجاج تكا بوتي', category: 'BBQs', price: 20 },
  { shortCode: 'SA51', title: 'Chicken Boti Boneless دجاج بوتي بدون عظم', category: 'BBQs', price: 20 },
  { shortCode: 'SA52', title: 'Beef Seekh Kabab لحم سيخ كباب', category: 'BBQs', price: 22 },
  { shortCode: 'SA53', title: 'Chicken Seekh Kabab سيخ كباب دجاج', category: 'BBQs', price: 22 },
  { shortCode: 'SA54', title: 'Rashmi Chicken Kabab كباب دجاج راشمي', category: 'BBQs', price: 22 },
  { shortCode: 'SA55', title: 'Chicken Tikka دجاج تيكا', category: 'BBQs', price: 8 },
  { shortCode: 'SA31', title: 'Mutton Pulao Full لحم ضأن بولاو', category: 'RICE', price: 20 },
  { shortCode: 'SA32', title: 'Mutton Biryani Full برياني لحم ضأن', category: 'RICE', price: 20 },
  { shortCode: 'SA33', title: 'Chicken Biryani Full برياني دجاج', category: 'RICE', price: 15 },
  { shortCode: 'SA34', title: 'Chicken Pulao Full دجاج بولاو', category: 'RICE', price: 18 },
  { shortCode: 'SA344', title: 'Kabuli Pulao / 15 كابولي الأرز', category: 'RICE', price: 18 },
  { shortCode: 'SA345', title: 'Kabuli Pulao / 25 كابولي الأرز', category: 'RICE', price: 25 },
  { shortCode: 'SA35', title: 'Mutton Karahi Special Half Kg 1/2 لحم ضأن كراهي خاص', category: 'MUTTON', price: 60 },
  { shortCode: 'SA36', title: 'Mutton Karahi Specialone Kg 1 لحم ضأن كراهي خاص', category: 'MUTTON', price: 120 },
  { shortCode: 'SA37', title: 'Mutton Korma Full لحم الضأن كورما', category: 'MUTTON', price: 20 },
  { shortCode: 'SA38', title: 'Beef Fry Masala Full', category: 'MUTTON', price: 20 },
  { shortCode: 'SA39', title: 'Namkeen Meat لحم مملح', category: 'MUTTON', price: 30 },
  { shortCode: 'SA107', title: 'Mutton Korma (Half) Plate كورمة لحم الضأن (نصف طبق)', category: 'MUTTON', price: 13 },
  { shortCode: 'SA108', title: 'Namkeen Meat (Half) Plate لحم مالح (نصف طبق)', category: 'MUTTON', price: 15 },
  { shortCode: 'Beef1', title: 'Beef Fry Masala 1/2', category: 'MUTTON', price: 13 },
  { shortCode: 'Chick11', title: 'chicken jalfrezi دجاج', category: 'CHICKEN', price: 22 },
  { shortCode: 'Chick12', title: 'chicken jalfrezi 1/2 دجاج', category: 'CHICKEN', price: 13 },
  { shortCode: 'ChB11', title: 'Butter Chicken 1/2 دجاج بالزبدة', category: 'CHICKEN', price: 13 },
  { shortCode: 'SA109', title: 'Chicken Korma (Half) Plate كورمة دجاج (نصف طبق)', category: 'CHICKEN', price: 10 },
  { shortCode: 'SA41', title: 'Chicken Karahi Full (Kg) دجاج كراهي كامل', category: 'CHICKEN', price: 80 },
  { shortCode: 'SA42', title: 'Chicken Karahi Half (Kg) دجاج كراهي نصف', category: 'CHICKEN', price: 45 },
  { shortCode: 'SA43', title: 'Chicken White Karahi Full (Kg) دجاج ابيض كراهي', category: 'CHICKEN', price: 90 },
  { shortCode: 'SA44', title: 'Chicken White Karahi Half (Kg) دجاج ابيض كراهي', category: 'CHICKEN', price: 45 },
  { shortCode: 'SA45', title: 'Chicken Korma (Full) Plate دجاج كورما', category: 'CHICKEN', price: 15 },
  { shortCode: 'SA46', title: 'Butter Chicken دجاج بالزبدة', category: 'CHICKEN', price: 22 },
  { shortCode: 'SA65', title: 'Mutter Keema Full مطر كيما كامل', category: 'VEGETABLE', price: 20 },
  { shortCode: 'SA66', title: 'Mix Vegetable Aloo Matar Gajar Methi Full مزيج الخضار', category: 'VEGETABLE', price: 8 },
  { shortCode: 'SA68', title: 'Aloo Palak Full ألو بالاك', category: 'VEGETABLE', price: 8 },
  { shortCode: 'SA69', title: 'Saag Makhani صاج ماخاني', category: 'VEGETABLE', price: 12 },
  { shortCode: 'SA70', title: 'Makki Roti 2 \\ Saag 20Sr مكي روتي 2 + ساگ', category: 'VEGETABLE', price: 20 },
  { shortCode: 'SA71', title: 'Karela Fry كيرالا فراي', category: 'VEGETABLE', price: 12 },
  { shortCode: 'Sal12', title: 'special Green salad / 5 سلطة خضراء مميزة', category: 'VEGETABLE', price: 5 },
  { shortCode: 'SA611', title: 'Haleem - 1/2 حليم', category: 'Dal\'s', price: 10 },
  { shortCode: 'Dal12', title: 'shahee Dal Mash 1/2 شاهي دال ماس', category: 'Dal\'s', price: 8 },
  { shortCode: 'Dal122', title: 'Dal Chana - 1/2 دال شانا', category: 'Dal\'s', price: 6 },
  { shortCode: 'dal6', title: 'shahee Dal Mash full شاهي دال ماس', category: 'Dal\'s', price: 10 },
  { shortCode: 'dal62', title: 'shahee Dal Mash 1/2 شاهي دال ماس', category: 'Dal\'s', price: 8 },
  { shortCode: 'SA61', title: 'Haleem full حليم', category: 'Dal\'s', price: 15 },
  { shortCode: 'SA62', title: 'Kadhi Pakora كادهي باكورة', category: 'Dal\'s', price: 10 },
  { shortCode: 'SA63', title: 'shahee Dal Mash شاهي دال ماس', category: 'Dal\'s', price: 10 },
  { shortCode: 'SA64', title: 'Dal Chana دال شانا', category: 'Dal\'s', price: 8 },
  { shortCode: 'SA106', title: 'Chana Half نصف شانا', category: 'Dal\'s', price: 4 },
  { shortCode: 'SA29', title: 'Burma برمة', category: 'Specialities', price: 50 },
  { shortCode: 'SA30', title: 'Madghout Laham مضغوط لحم', category: 'Specialities', price: 50 },
  { shortCode: 'SA72', title: 'Mix Pakistani Sweets حلويات باكستانية مشكلة', category: 'Sweets and Salty Special Al Rawaq', price: 38 },
  { shortCode: 'SA73', title: 'Samosa Pakistani ساموسة باكستاني', category: 'Sweets and Salty Special Al Rawaq', price: 2 },
  { shortCode: 'SA75', title: 'Fruit Chaat Plates أطباق شات الفاكهة', category: 'Sweets and Salty Special Al Rawaq', price: 8 },
  { shortCode: 'SA76', title: 'Gulab Jamun (1Kg) جولاب جامون', category: 'Sweets and Salty Special Al Rawaq', price: 40 },
  { shortCode: 'SA77', title: 'Ras Gulla Sweets (1Kg) حلويات رأس جلاي', category: 'Sweets and Salty Special Al Rawaq', price: 40 },
  { shortCode: 'SA78', title: 'Jalebi (1Kg) جلابي', category: 'Sweets and Salty Special Al Rawaq', price: 25 },
  { shortCode: 'SA79', title: 'Ras Malai رأس ملاي', category: 'Sweets and Salty Special Al Rawaq', price: 8 },
  { shortCode: 'SA80', title: 'Pakora Pakistani الباكورا الباكستانية', category: 'Sweets and Salty Special Al Rawaq', price: 25 },
  { shortCode: 'SA81', title: 'Rabri Milk Glasses حليب رابري', category: 'Sweets and Salty Special Al Rawaq', price: 8 },
  { shortCode: 'SA83', title: 'Sweet Kheer حلوى كير', category: 'Sweets and Salty Special Al Rawaq', price: 7 },
  { shortCode: 'SA84', title: 'Sweet حلوى', category: 'Sweets and Salty Special Al Rawaq', price: 5 },
  { shortCode: 'SA90', title: 'Mirinda Citrus 330ML ميريندا سيترس ٣٣٠ مل', category: 'Drink', price: 2.5 },
  { shortCode: 'SA91', title: 'Mirinda Citrus Orange 330ML ميريندا برتقال سيترس ٣٣٠ مل', category: 'Drink', price: 2.5 },
  { shortCode: 'SA92', title: 'Mirinda 1LTR', category: 'Drink', price: 5 },
  { shortCode: 'SA93', title: 'Pepsi 330ML بيبسي ٣٣٠ مل', category: 'Drink', price: 2.5 },
  { shortCode: 'SA94', title: 'Pepsi Diet 330ML بيبسي دايت ٣٣٠ مل', category: 'Drink', price: 2.5 },
  { shortCode: 'SA95', title: 'Rabie Juice عصير راني', category: 'Drink', price: 3 },
  { shortCode: 'SA96', title: '7UP Diet سفن أب دايت', category: 'Drink', price: 3 },
  { shortCode: 'SA97', title: 'Sun Top 250ML صن توب ٢٥٠ مل', category: 'Drink', price: 1.5 },
  { shortCode: 'SA98', title: 'Water 660 ml ماء', category: 'Drink', price: 1 },
  { shortCode: 'SA99', title: 'Kinza كينزا', category: 'Drink', price: 2.5 },
  { shortCode: 'SA100', title: 'Coca Cola كوكا كولا', category: 'Drink', price: 2.5 },
  { shortCode: 'SA101', title: 'Mountain Dew ماونتن ديو', category: 'Drink', price: 2.5 },
  { shortCode: 'SA102', title: '7UP سفن أب', category: 'Drink', price: 2.5 },
  { shortCode: 'SA103', title: 'Sprite سبرايت', category: 'Drink', price: 2.5 },
  { shortCode: 'SA104', title: 'Pepsi 1LTR بيبسي ١ لتر', category: 'Drink', price: 5 },
  { shortCode: 'SA105', title: 'Water Small نصف ماء', category: 'Drink', price: 0.5 },
  { shortCode: 'Alm01', title: 'Almarai Full Fat Fresh Laban 360 Ml', category: 'BEVERAGES', price: 3 },
  { shortCode: 'alm02', title: 'Almarai Full Fat Fresh Laban 180 Ml', category: 'BEVERAGES', price: 2 },
  { shortCode: 'alm03', title: 'Almarai Plain Full Fat Yogurt', category: 'BEVERAGES', price: 2 },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Process categories
    const categories = new Set(itemsToSeed.map(i => i.category));
    let catMap = {};
    for (const catName of categories) {
      let catRes = await client.query('SELECT id FROM categories WHERE name = $1', [catName]);
      if (catRes.rows.length === 0) {
        let insertRes = await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [catName]);
        catMap[catName] = insertRes.rows[0].id;
      } else {
        catMap[catName] = catRes.rows[0].id;
      }
    }

    // Insert items
    for (const item of itemsToSeed) {
      // Check if short code already exists (only add if not)
      const existCheck = await client.query('SELECT id FROM items WHERE short_code = $1', [item.shortCode]);
      
      if (existCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO items (category_id, name, price, available_branches, short_code) 
           VALUES ($1, $2, $3, $4, $5)`,
          [catMap[item.category], item.title, item.price, JSON.stringify(['Branch 2']), item.shortCode]
        );
      } else {
        console.log(`Skipping ${item.shortCode}, already exists.`);
      }
    }

    await client.query('COMMIT');
    console.log('Successfully seeded Branch 2 items.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
