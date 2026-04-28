import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://karmansingharora03_db_user:8813917626$Karman@cluster0.xcbajta.mongodb.net/inventory";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db('inventory');
    const products = database.collection('products');

    const result = await products.updateMany(
      { in_stock: { $exists: false } },
      { $set: { in_stock: true } }
    );

    console.log(`Matched ${result.matchedCount} and updated ${result.modifiedCount} products to be in_stock: true by default.`);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
