const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbAdmin = new AWS.DynamoDB();

module.exports = { dynamodb, dynamodbAdmin };

