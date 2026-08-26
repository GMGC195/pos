const pool = require('./db');

const categories = [
  { name: 'Breakfast Delights' },
  { name: 'Bar BQ Smoke Spice' },
  { name: 'Meats & Chicken' },
  { name: 'Biryani & Pulao' },
  { name: 'Sweet & Salty' },
  { name: 'Beverages' },
  { name: 'Veggie & Lentil Treats' },
];

const items = [
  // Breakfast
  { name: 'Nihari Special', cat: 'Breakfast Delights', price: 24, size_options: [] },
  { name: 'Mutton Paya', cat: 'Breakfast Delights', price: 22, size_options: [] },
  { name: 'Halwa Puri Chana', cat: 'Breakfast Delights', price: 8, size_options: [] },
  { name: 'French Toast (4 pieces)', cat: 'Breakfast Delights', price: 10, size_options: [] },
  { name: 'Omelette', cat: 'Breakfast Delights', price: 5, size_options: [] },
  { name: 'Punjabi Lassi', cat: 'Breakfast Delights', price: 6, size_options: [] },
  { name: 'Tandoori Roti', cat: 'Breakfast Delights', price: 0.5, size_options: [] },
  { name: 'Garlic Naan', cat: 'Breakfast Delights', price: 3, size_options: [] },
  { name: 'Plain Naan', cat: 'Breakfast Delights', price: 3, size_options: [] },
  { name: 'Butter Naan', cat: 'Breakfast Delights', price: 3, size_options: [] },
  { name: 'Aloo Naan', cat: 'Breakfast Delights', price: 5, size_options: [] },
  { name: 'Keema Naan', cat: 'Breakfast Delights', price: 10, size_options: [] },
  { name: 'Aloo Paratha', cat: 'Breakfast Delights', price: 3, size_options: [] },
  { name: 'Mooli Paratha', cat: 'Breakfast Delights', price: 4, size_options: [] },

  // BBQ
  { name: 'Chicken Malai Boti (3 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Sheesh Tauwq Boti (3 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Chicken Tikka Boti (3 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Green Bote (3 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Chicken Boti Boneless (3 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Beef Seekh Kabab (4 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Chicken Seekh Kabab (4 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Bihari Kabab (4 Seekh)', cat: 'Bar BQ Smoke Spice', price: 20, size_options: [] },
  { name: 'Fish Tikka', cat: 'Bar BQ Smoke Spice', price: 40, size_options: [] },
  { name: 'Chicken Tikka', cat: 'Bar BQ Smoke Spice', price: 8, size_options: [] },
  { name: 'Rawaq BBQ Platter', cat: 'Bar BQ Smoke Spice', price: 45, size_options: [] },

  // Meats & Chicken
  { name: 'Mutton Karahi', cat: 'Meats & Chicken', price: 120, size_options: ['KG:120', 'HALF:60'] },
  { name: 'Mutton Korma', cat: 'Meats & Chicken', price: 20, size_options: [] },
  { name: 'Mutton Badami Korma', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Mutton Achari', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Chicken Karahi Full', cat: 'Meats & Chicken', price: 80, size_options: ['KG:80', 'HALF:40'] },
  { name: 'Chicken White Karahi', cat: 'Meats & Chicken', price: 90, size_options: ['KG:90', 'HALF:45'] },
  { name: 'Chicken Korma', cat: 'Meats & Chicken', price: 15, size_options: [] },
  { name: 'Butter Chicken', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Chicken Jalfrezi', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Murgh Makhni Handi', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Chicken Handi', cat: 'Meats & Chicken', price: 22, size_options: [] },
  { name: 'Beef Fry Masala', cat: 'Meats & Chicken', price: 20, size_options: [] },

  // Biryani
  { name: 'Al Shawaya - Grilled Chicken Without Rice', cat: 'Biryani & Pulao', price: 30, size_options: ['FULL:30', 'HALF:15', 'QUARTER:8'] },
  { name: 'Al Shawaya - Grilled Chicken With Rice', cat: 'Biryani & Pulao', price: 40, size_options: ['FULL:40', 'HALF:20', 'QUARTER:10'] },
  { name: 'Al-Faham Chicken On Coal Without Rice', cat: 'Biryani & Pulao', price: 30, size_options: ['FULL:30', 'HALF:15', 'QUARTER:8'] },
  { name: 'Al-Faham Chicken On Coal With Rice', cat: 'Biryani & Pulao', price: 40, size_options: ['FULL:40', 'HALF:20', 'QUARTER:10'] },
  { name: 'Bukhari Rice', cat: 'Biryani & Pulao', price: 5, size_options: [] },
  { name: 'Mutton Pulao', cat: 'Biryani & Pulao', price: 20, size_options: [] },
  { name: 'Mutton Biryani', cat: 'Biryani & Pulao', price: 20, size_options: [] },
  { name: 'Chicken Biryani', cat: 'Biryani & Pulao', price: 15, size_options: [] },
  { name: 'Chicken Pulao', cat: 'Biryani & Pulao', price: 15, size_options: [] },
  { name: 'Biryani Rice', cat: 'Biryani & Pulao', price: 8, size_options: [] },

  // Sweet
  { name: 'Samosa Pakistani', cat: 'Sweet & Salty', price: 2, size_options: ['EACH:2', 'PLATE:5'] },
  { name: 'Dahi Bhallay', cat: 'Sweet & Salty', price: 8, size_options: [] },
  { name: 'Fruit Chaat', cat: 'Sweet & Salty', price: 8, size_options: [] },
  { name: 'Gulab Jamun (KG)', cat: 'Sweet & Salty', price: 35, size_options: [] },
  { name: 'Jalebi (KG)', cat: 'Sweet & Salty', price: 22, size_options: [] },
  { name: 'Rasmalai', cat: 'Sweet & Salty', price: 8, size_options: [] },
  { name: 'Pakory (KG)', cat: 'Sweet & Salty', price: 22, size_options: [] },
  { name: 'Mix Pakistani Sweets (KG)', cat: 'Sweet & Salty', price: 35, size_options: [] },
  { name: 'French Fries', cat: 'Sweet & Salty', price: 5, size_options: [] },
  { name: 'Sweet Kheer', cat: 'Sweet & Salty', price: 6, size_options: [] },

  // Beverages
  { name: 'Water 330ml', cat: 'Beverages', price: 0.5, size_options: [] },
  { name: 'Shani Soft Drink', cat: 'Beverages', price: 2.5, size_options: [] },
  { name: 'Lemon Mint', cat: 'Beverages', price: 8, size_options: [] },
  { name: 'Mango Shake', cat: 'Beverages', price: 8, size_options: [] },
  { name: 'Very Berry Smoothie', cat: 'Beverages', price: 12, size_options: [] },
  { name: 'Pepsi 245ml', cat: 'Beverages', price: 2, size_options: [] },
  { name: 'Kinza Cola 320ml', cat: 'Beverages', price: 2, size_options: [] },
  { name: '7UP 245ml', cat: 'Beverages', price: 2, size_options: [] },

  // Veggie
  { name: 'Haleem Chicken', cat: 'Veggie & Lentil Treats', price: 15, size_options: [] },
  { name: 'Al Rawaq Special Dal', cat: 'Veggie & Lentil Treats', price: 15, size_options: [] },
  { name: 'Dal Tadka', cat: 'Veggie & Lentil Treats', price: 10, size_options: [] },
  { name: 'Kari Pakora', cat: 'Veggie & Lentil Treats', price: 10, size_options: [] },
  { name: 'Dal Mash', cat: 'Veggie & Lentil Treats', price: 8, size_options: [] },
  { name: 'Karelay Gosht Mutton', cat: 'Veggie & Lentil Treats', price: 20, size_options: [] },
  { name: 'Bhindi Masala', cat: 'Veggie & Lentil Treats', price: 10, size_options: [] },
  { name: 'Palak Paneer', cat: 'Veggie & Lentil Treats', price: 15, size_options: [] },
  { name: 'Mix Vegetable', cat: 'Veggie & Lentil Treats', price: 8, size_options: [] },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert categories
    const categoryMap = {};
    for (const cat of categories) {
      const res = await client.query(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [cat.name]
      );
      categoryMap[cat.name] = { id: res.rows[0].id };
    }

    // Insert items
    let count = 0;
    for (const item of items) {
      const catInfo = categoryMap[item.cat];
      if (!catInfo) continue;
      await client.query(
        `INSERT INTO items (category_id, name, price, size_options, status) 
         VALUES ($1, $2, $3, $4, 'Active')
         ON CONFLICT DO NOTHING`,
        [
          catInfo.id,
          item.name,
          item.price,
          item.size_options
        ]
      );
      count++;
    }

    await client.query('COMMIT');
    console.log(`Successfully seeded ${categories.length} categories and ${count} items!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', err);
  } finally {
    client.release();
  }
}

seed().then(() => process.exit(0));
