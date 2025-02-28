const { dynamodbAdmin } = require('../config/db');

const tables = {
  Communities: {
    TableName: 'Communities',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  Securities: {
    TableName: 'Securities',
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
      { AttributeName: 'communityId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'communityId', AttributeType: 'S' },
      { AttributeName: 'phoneNumber', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'PhoneNumberIndex',
      KeySchema: [{ AttributeName: 'phoneNumber', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  VillaOwners: {
    TableName: 'VillaOwners',
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
      { AttributeName: 'communityId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'communityId', AttributeType: 'S' },
      { AttributeName: 'phoneNumber', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'PhoneNumberIndex',
        KeySchema: [{ AttributeName: 'phoneNumber', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  Robots: {
    TableName: 'Robots',
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
      { AttributeName: 'communityId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'communityId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'StatusIndex',
      KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  Deliveries: {
    TableName: 'Deliveries',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'robotId', AttributeType: 'S' },
      { AttributeName: 'securityId', AttributeType: 'S' },
      { AttributeName: 'ownerId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RobotDeliveryIndex',
        KeySchema: [
          { AttributeName: 'robotId', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'SecurityDeliveryIndex',
        KeySchema: [{ AttributeName: 'securityId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'OwnerDeliveryIndex',
        KeySchema: [{ AttributeName: 'ownerId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  Tickets: {
    TableName: 'Tickets',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'ownerId', AttributeType: 'S' },
      { AttributeName: 'robotId', AttributeType: 'S' },
      { AttributeName: 'deliveryId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'communityId', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'OwnerTicketsIndex',
        KeySchema: [
          { AttributeName: 'ownerId', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'RobotTicketsIndex',
        KeySchema: [{ AttributeName: 'robotId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'DeliveryTicketsIndex',
        KeySchema: [{ AttributeName: 'deliveryId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'CommunityTicketIndex',
        KeySchema: [
          { AttributeName: 'communityId', KeyType: 'HASH' },
          
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  Alerts: {
    TableName: 'Alerts',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'robotId', AttributeType: 'S' },
      { AttributeName: 'deliveryId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RobotAlertIndex',
        KeySchema: [
          { AttributeName: 'robotId', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'DeliveryAlertIndex',
        KeySchema: [{ AttributeName: 'deliveryId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  OTPVerification: {
    TableName: 'OTPVerification',
  KeySchema: [
    { 
      AttributeName: 'phoneNumber',
      KeyType: 'HASH'  // Partition key
    }
  ],
  AttributeDefinitions: [
    { 
      AttributeName: 'phoneNumber',
      AttributeType: 'S' 
    }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  }
  }
};

// Create tables
async function createTables() {
  for (const [tableName, schema] of Object.entries(tables)) {
    try {
      await dynamodbAdmin.createTable(schema).promise();
      console.log(`Created table: ${tableName}`);
    } catch (error) {
      if (error.code === 'ResourceInUseException') {
        console.log(`Table ${tableName} already exists`);
      } else {
        console.error(`Error creating table ${tableName}:`, error);
      }
    }
  }
}

module.exports = { createTables };