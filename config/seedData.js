const { dynamodb } = require('./db');

const seedData = async () => {
  // Communities
  const communities = [
    {
      id: 'comm-001',
      name: 'Palm Springs Villa',
      address: '123 Palm Avenue, Dubai',
      createdAt: new Date().toISOString()
    },
    {
      id: 'comm-002',
      name: 'Desert Rose Community',
      address: '456 Rose Road, Dubai',
      createdAt: new Date().toISOString()
    },
    {
      id: 'comm-003',
      name: 'Oasis Gardens',
      address: '789 Oasis Boulevard, Dubai',
      createdAt: new Date().toISOString()
    }
  ];

  // Securities
  const securities = [
    {
      id: 'sec-001',
      communityId: 'comm-001',
      name: 'John Smith',
      phoneNumber: '+971501234567',
      currentLatitude: 25.2048,
      currentLongitude: 55.2708,
      createdAt: new Date().toISOString()
    },
    {
      id: 'sec-002',
      communityId: 'comm-002',
      name: 'Mike Johnson',
      phoneNumber: '+971502345678',
      currentLatitude: 25.1972,
      currentLongitude: 55.2744,
      createdAt: new Date().toISOString()
    },
    {
      id: 'sec-003',
      communityId: 'comm-003',
      name: 'David Wilson',
      phoneNumber: '+971503456789',
      currentLatitude: 25.2012,
      currentLongitude: 55.2678,
      createdAt: new Date().toISOString()
    }
  ];

  // Villa Owners
  const villaOwners = [
    {
      id: 'own-001',
      communityId: 'comm-001',
      villaNumber: 'V101',
      name: 'Sarah Ahmed',
      phoneNumber: '+971504567890',
      email: 'sarah@example.com',
      latitude: 25.2048,
      longitude: 55.2708,
      createdAt: new Date().toISOString()
    },
    {
      id: 'own-002',
      communityId: 'comm-002',
      villaNumber: 'V202',
      name: 'Mohammed Ali',
      phoneNumber: '+971505678901',
      email: 'mohammed@example.com',
      latitude: 25.1972,
      longitude: 55.2744,
      createdAt: new Date().toISOString()
    },
    {
      id: 'own-003',
      communityId: 'comm-003',
      villaNumber: 'V303',
      name: 'Lisa Chen',
      phoneNumber: '+971506789012',
      email: 'lisa@example.com',
      latitude: 25.2012,
      longitude: 55.2678,
      createdAt: new Date().toISOString()
    }
  ];

  // Robots
  const robots = [
    {
      id: 'rob-001',
      communityId: 'comm-001',
      name: 'RoboX-1',
      status: 'active',
      currentLatitude: 25.2048,
      currentLongitude: 55.2708,
      batteryLevel: 95,
      totalDistance: 150.5,
      totalDeliveries: 42,
      totalTime: '120:30:00',
      createdAt: new Date().toISOString()
    },
    {
      id: 'rob-002',
      communityId: 'comm-002',
      name: 'RoboX-2',
      status: 'charging',
      currentLatitude: 25.1972,
      currentLongitude: 55.2744,
      batteryLevel: 30,
      totalDistance: 200.7,
      totalDeliveries: 55,
      totalTime: '145:20:00',
      createdAt: new Date().toISOString()
    },
    {
      id: 'rob-003',
      communityId: 'comm-003',
      name: 'RoboX-3',
      status: 'active',
      currentLatitude: 25.2012,
      currentLongitude: 55.2678,
      batteryLevel: 85,
      totalDistance: 175.3,
      totalDeliveries: 48,
      totalTime: '132:45:00',
      createdAt: new Date().toISOString()
    },
    {
      id: 'rob-004',
      communityId: 'comm-003',
      name: 'RoboX-4',
      status: 'active',
      currentLatitude: 25.2012,
      currentLongitude: 55.2678,
      batteryLevel: 85,
      totalDistance: 145.3,
      totalDeliveries: 43,
      totalTime: '132:45:00',
      createdAt: new Date().toISOString()
    }
  ];

  // Deliveries
  const deliveries = [
    {
      id: 'del-001',
      robotId: 'rob-001',
      securityId: 'sec-001',
      ownerId: 'own-001',
      deliveryType: 'package',
      status: 'completed',
      startTime: '2024-01-08T10:00:00Z',
      endTime: '2024-01-08T10:30:00Z',
      startLatitude: 25.2048,
      startLongitude: 55.2708,
      endLatitude: 25.2050,
      endLongitude: 55.2710,
      distanceCovered: 0.5,
      createdAt: new Date().toISOString(),
      communityId: 'comm-001'
    },
    {
      id: 'del-002',
      robotId: 'rob-002',
      securityId: 'sec-002',
      ownerId: 'own-002',
      deliveryType: 'mail',
      status: 'in_progress',
      startTime: '2024-01-08T11:00:00Z',
      startLatitude: 25.1972,
      startLongitude: 55.2744,
      createdAt: new Date().toISOString(),
      communityId: 'comm-001'
    },
    {
      id: 'del-003',
      robotId: 'rob-003',
      securityId: 'sec-003',
      ownerId: 'own-003',
      deliveryType: 'package',
      status: 'pending',
      createdAt: new Date().toISOString(),
      communityId: 'comm-003'
    }
  ];

  // Tickets
  const tickets = [
    {
      id: 'tick-001',
      ownerId: 'own-001',
      robotId: 'rob-001',
      deliveryId: 'del-001',
      issueType: 'delay',
      description: 'Delivery taking longer than expected',
      priority:'low',
      status: 'resolved',
      communityId:'comm-001',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tick-002',
      ownerId: 'own-002',
      robotId: 'rob-002',
      deliveryId: 'del-002',
      issueType: 'location',
      description: 'Robot stopped at wrong location',
      status: 'open',
      communityId:'comm-002',
      priority:'high',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tick-003',
      ownerId: 'own-003',
      robotId: 'rob-003',
      deliveryId: 'del-003',
      issueType: 'technical',
      description: 'Robot not responding to commands',
      status: 'in_progress',
      communityId:'comm-003',
      priority:'medium',
      createdAt: new Date().toISOString()
    }
  ];

  // Alerts
  const alerts = [
    {
      id: 'alt-001',
      robotId: 'rob-001',
      deliveryId: 'del-001',
      alertType: 'battery_low',
      latitude: 25.2048,
      longitude: 55.2708,
      description: 'Battery level below 20%',
      status: 'resolved',
      createdAt: new Date().toISOString()
    },
    {
      id: 'alt-002',
      robotId: 'rob-002',
      deliveryId: 'del-002',
      alertType: 'obstacle',
      latitude: 25.1972,
      longitude: 55.2744,
      description: 'Obstacle detected on path',
      status: 'active',
      createdAt: new Date().toISOString()
    },
    {
      id: 'alt-003',
      robotId: 'rob-003',
      deliveryId: 'del-003',
      alertType: 'connection_lost',
      latitude: 25.2012,
      longitude: 55.2678,
      description: 'Lost connection with robot',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];

  // Function to insert items into a table
  const insertItems = async (tableName, items) => {
    for (const item of items) {
      try {
        await dynamodb.put({
          TableName: tableName,
          Item: item
        }).promise();
        console.log(`Successfully inserted item into ${tableName}`);
      } catch (error) {
        console.error(`Error inserting into ${tableName}:`, error);
      }
    }
  };

  // Insert all data
  try {
    await insertItems('Communities', communities);
    await insertItems('Securities', securities);
    await insertItems('VillaOwners', villaOwners);
    await insertItems('Robots', robots);
    await insertItems('Deliveries', deliveries);
    await insertItems('Tickets', tickets);
    await insertItems('Alerts', alerts);
    console.log('All data seeded successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
  }
};

// Run the seeding function
seedData();

module.exports = { seedData };