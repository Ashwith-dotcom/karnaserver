const express = require('express');
const router = express.Router();
const {dynamodb} = require('../config/db')
const { v4: uuidv4 } = require('uuid');
const mqtt = require('mqtt');


const mqttClient = mqtt.connect({
  host: '65f02f33157749ed9e713a070f930f6e.s1.eu.hivemq.cloud', 
  port: 8883, 
  protocol: 'mqtts', 
  clientId: 'client-server', 
  username: 'serverclient',
  password: 'Serverhive@234', 
  rejectUnauthorized: true, 
});

// mqttClient.on('connect', () => {
//   console.log('Connected to HiveMQ Cloud');
// });

// mqttClient.on('error', (error) => {
//   console.error('Error connecting to HiveMQ Cloud:', error);
// });

// mqttClient.on('close', () => {
//   console.log('MQTT connection closed');
// });

router.post('/signup', async (req, res) => {
  const { name, phoneNumber, communityId, currentLatitude, currentLongitude } = req.body;

  try {
    // Check if phone number already exists
    const existingUser = await dynamodb.query({
      TableName: 'Securities',
      IndexName: 'PhoneNumberIndex',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      ExpressionAttributeValues: {
        ':phoneNumber': phoneNumber
      }
    }).promise();

    if (existingUser.Items.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const security = {
      id: `sec-${uuidv4()}`,
      communityId,
      name,
      phoneNumber,
      currentLatitude,
      currentLongitude,
      createdAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Securities',
      Item: security
    }).promise();

    res.status(201).json(security);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security Login
router.post('/login', async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const result = await dynamodb.query({
      TableName: 'Securities',
      IndexName: 'PhoneNumberIndex',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      ExpressionAttributeValues: {
        ':phoneNumber': phoneNumber
      }
    }).promise();

    if (result.Items.length === 0) {
      return res.status(404).json({ error: 'Security not found' });
    }

    res.json(result.Items[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ... (your existing code)

router.put('/location/:securityId', async (req, res) => {
  const { securityId } = req.params;
  const { currentLatitude, currentLongitude } = req.body;

  try {
    // 1. Use a query to find the security guard with the given ID
    const securityQuery = await dynamodb.query({
      TableName: 'Securities',
      KeyConditionExpression: 'id = :securityId',
      ExpressionAttributeValues: {
        ':securityId': securityId
      }
    }).promise();

    if (securityQuery.Items.length === 0) {
      return res.status(404).json({ error: 'Security guard not found' });
    }

    const securityItem = securityQuery.Items[0];
    const communityId = securityItem.communityId;

    // 2. Update security location using both HASH and RANGE keys
    await dynamodb.update({
      TableName: 'Securities',
      Key: {
        id: securityId,
        communityId: communityId
      },
      UpdateExpression: 'set currentLatitude = :latitude, currentLongitude = :longitude',
      ExpressionAttributeValues: {
        ':latitude': currentLatitude,
        ':longitude': currentLongitude,
      },
      ReturnValues: 'UPDATED_NEW',
    }).promise();

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new delivery
router.post('/deliveries', async (req, res) => {
    const { securityId, villaNumber, deliveryType } = req.body;
  
    try {
      // Get security details with both id and communityId
      const securityData = await dynamodb.scan({
        TableName: 'Securities',
        FilterExpression: 'id = :securityId',
        ExpressionAttributeValues: {
          ':securityId': securityId
        }
      }).promise();
  
      if (!securityData.Items || securityData.Items.length === 0) {
        return res.status(404).json({ error: 'Security not found' });
      }
  
      const security = securityData.Items[0];
  
      // Get villa owner details
      const ownerData = await dynamodb.scan({
        TableName: 'VillaOwners',
        FilterExpression: 'villaNumber = :villaNumber AND communityId = :communityId',
        ExpressionAttributeValues: {
          ':villaNumber': villaNumber,
          ':communityId': security.communityId
        }
      }).promise();
  
      if (ownerData.Items.length === 0) {
        return res.status(404).json({ error: 'Villa not found' });
      }
  
      // Get available robot in the community
      const robotData = await dynamodb.scan({
        TableName: 'Robots',
        FilterExpression: '#status = :status AND communityId = :communityId',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'active',
          ':communityId': security.communityId
        }
      }).promise();
  
      if (robotData.Items.length === 0) {
        return res.status(400).json({ error: 'No available robots' });
      }
  
      const robot = robotData.Items[0];
      const owner = ownerData.Items[0];
  
      const delivery = {
        id: `del-${uuidv4()}`,
        robotId: robot.id,
        securityId,
        ownerId: owner.id,
        communityId: security.communityId,
        deliveryType,
        status: 'in_progress',
        startTime: new Date().toISOString(),
        startLatitude: security.currentLatitude,
        startLongitude: security.currentLongitude,
        endLatitude: owner.latitude,
        endLongitude: owner.longitude,
        createdAt: new Date().toISOString()
      };
  
      await dynamodb.put({
        TableName: 'Deliveries',
        Item: delivery
      }).promise();
  
      // Update robot status using both primary key elements
      await dynamodb.update({
        TableName: 'Robots',
        Key: {
          id: robot.id,
          communityId: robot.communityId
        },
        UpdateExpression: 'set #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'delivering'
        }
      }).promise();
      const robotTopic = `robot/${robot.id}/command`;
      const message = JSON.stringify({
        securityId: security.id,
        ownerId: owner.id,
        deliveryId: delivery.id,
        action: 'start_delivery',
        ownerLocation: {
          latitude: owner.latitude,
          longitude: owner.longitude,
        },
      });

    mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
      if (error) {
        console.error('Error publishing MQTT message:', error);
        // Handle the error appropriately (e.g., retry, rollback delivery)
      } else {
        console.log('MQTT message published successfully', message);
      }
    });
  
      res.status(201).json(delivery);
    } catch (error) {
      console.error('Delivery error:', error);
      res.status(500).json({ error: error.message });
    }
  });

module.exports = router;