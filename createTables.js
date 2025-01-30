require('dotenv').config();
const { createTables } = require('./config/tables');

async function init() {
  try {
    console.log('Creating DynamoDB tables...');
    await createTables();
    console.log('Tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

init();