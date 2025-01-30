require('dotenv').config();
const { seedData } = require('./config/seedData');

async function init() {
  try {
    console.log('inserting values into DynamoDB tables...');
    await seedData();
    console.log('inserted successfully!');
  } catch (error) {
    console.error('Error inserting tables:', error);
    process.exit(1);
  }
}

init();