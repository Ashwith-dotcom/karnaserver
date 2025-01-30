const express = require('express');
const router = express.Router();
const { dynamodb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const mqtt = require('mqtt');
const AWS = require('aws-sdk');
const multer = require("multer")


const COLLECTION_ID = 'villa_owners_faces';

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
})

const rekognition = new AWS.Rekognition()

const upload = multer({ storage: multer.memoryStorage() })

const mqttClient = mqtt.connect({
  host: '65f02f33157749ed9e713a070f930f6e.s1.eu.hivemq.cloud', 
  port: 8883, 
  protocol: 'mqtts', 
  clientId: 'client-server', 
  username: 'serverclient',
  password: 'Serverhive@234', 
  rejectUnauthorized: true, 
});

const checkRekognitionCollection = async () => {
  try {
    const collections = await rekognition.listCollections().promise();
    const collectionExists = collections.CollectionIds.includes(COLLECTION_ID);
    
    if (!collectionExists) {
      console.log(`Creating collection: ${COLLECTION_ID}`);
      await rekognition.createCollection({ CollectionId: COLLECTION_ID }).promise();
    } else {
      console.log(`Collection ${COLLECTION_ID} exists`);
    }
  } catch (error) {
    console.error('Error checking/creating Rekognition collection:', error);
  }
};

// Call this function when your server starts
checkRekognitionCollection();

router.get("/health-check", (req, res) => {
  res.status(200).json({ status: "OK" })
})

router.post('/signup', upload.single("faceImage"), async (req, res) => {
  const { name, email, phoneNumber, communityId, villaNumber, latitude, longitude  } = req.body;

  try {

    if (!name || !email || !phoneNumber || !communityId || !villaNumber || !req.file) {
      return res.status(400).json({ 
        error: 'All fields including face image are required' 
      });
    }
    
    // Check if phone number already exists
    const existingPhone = await dynamodb.query({
      TableName: 'VillaOwners',
      IndexName: 'PhoneNumberIndex',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      ExpressionAttributeValues: {
        ':phoneNumber': phoneNumber
      }
    }).promise();

    if (existingPhone.Items.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Check if email already exists
    const existingEmail = await dynamodb.query({
      TableName: 'VillaOwners',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }).promise();

    if (existingEmail.Items.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const base64Image = req.file.buffer.toString("base64")
    const imageBuffer = Buffer.from(base64Image, "base64")

    const indexFaceParams = {
      CollectionId: "villa_owners_faces",
      Image: {
        Bytes: imageBuffer,
      },
      ExternalImageId: `own-${uuidv4()}`,
      DetectionAttributes: ["ALL"],
    }

    const indexFaceResponse = await rekognition.indexFaces(indexFaceParams).promise()
    if (indexFaceResponse.FaceRecords.length === 0) {
      return res.status(400).json({ error: "No face detected in the image" })
    }

    const faceId = indexFaceResponse.FaceRecords[0].Face.FaceId


    const owner = {
      id: indexFaceParams.ExternalImageId,
      communityId,
      villaNumber,
      name,
      phoneNumber,
      email,
      latitude,
      longitude,
      faceId,
      createdAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'VillaOwners',
      Item: owner
    }).promise();


    res.status(201).json(owner);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-face", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file || !req.body.ownerId) {
      return res.status(400).json({ 
        error: "Missing required fields: faceImage and ownerId" 
      });
    }

    const { ownerId } = req.body;
    
    // Get owner details from DynamoDB with correct key structure
    const ownerResult = await dynamodb.query({
      TableName: "VillaOwners",
      KeyConditionExpression: "id = :ownerId",
      ExpressionAttributeValues: {
        ":ownerId": ownerId
      }
    }).promise();

    if (!ownerResult.Items || ownerResult.Items.length === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }

    const owner = ownerResult.Items[0];

    if (!owner.faceId) {
      return res.status(400).json({ error: "No registered face for this owner" });
    }

    // Convert image buffer to base64
    const imageBuffer = req.file.buffer;

    // Search face in Rekognition
    const searchFacesParams = {
      CollectionId: COLLECTION_ID,
      FaceMatchThreshold: 90,
      Image: { 
        Bytes: imageBuffer
      },
      MaxFaces: 1
    };

    console.log("Searching faces with params:", {
      CollectionId: searchFacesParams.CollectionId,
      FaceMatchThreshold: searchFacesParams.FaceMatchThreshold,
      MaxFaces: searchFacesParams.MaxFaces
    });

    const searchFacesResponse = await rekognition.searchFacesByImage(searchFacesParams).promise();
    console.log("Rekognition search response:", searchFacesResponse);

    if (searchFacesResponse.FaceMatches && searchFacesResponse.FaceMatches.length > 0) {
      const matchedFaceId = searchFacesResponse.FaceMatches[0].Face.FaceId;
      console.log("Matched FaceId:", matchedFaceId);
      console.log("Stored FaceId:", owner.faceId);
      
      if (owner.faceId === matchedFaceId) {
        return res.json({ 
          verified: true, 
          owner: { 
            id: owner.id, 
            name: owner.name 
          } 
        });
      }
    }

    return res.json({ verified: false });
  } catch (error) {
    console.error("Face verification error:", error);
    return res.status(500).json({ 
      error: error.message,
      details: error.code === 'ValidationException' ? 'Invalid DynamoDB query structure' : undefined
    });
  }
});


router.post('/login', async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const result = await dynamodb.query({
      TableName: 'VillaOwners',
      IndexName: 'PhoneNumberIndex',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      ExpressionAttributeValues: {
        ':phoneNumber': phoneNumber
      }
    }).promise();

    if (result.Items.length === 0) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    res.json(result.Items[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Current Delivery Status
router.get('/delivery/current/:ownerId', async (req, res) => {
    try {
      const { ownerId } = req.params;
  
      console.log('Querying for ownerId:', ownerId);
  
      // Query to get deliveries for the owner
      const deliveriesResult = await dynamodb.query({
        TableName: 'Deliveries',
        IndexName: 'OwnerDeliveryIndex',
        KeyConditionExpression: 'ownerId = :ownerId',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':ownerId': ownerId,
          ':status': 'in_progress'
        }
      }).promise();
  
      if (!deliveriesResult.Items || deliveriesResult.Items.length === 0) {
        return res.json({ message: 'No in-progress deliveries found' });
      }
  
      const delivery = deliveriesResult.Items[0];
      console.log('Delivery found:', delivery);
  
      // Validate communityId presence
      if (!delivery.communityId) {
        throw new Error('Missing communityId in delivery data');
      }
  
      // Fetch robot details
      const robotResult = await dynamodb.get({
        TableName: 'Robots',
        Key: {
          id: delivery.robotId,
          communityId: delivery.communityId
        }
      }).promise();
  
      if (!robotResult.Item) {
        throw new Error(`Robot with ID ${delivery.robotId} not found`);
      }
  
      const robot = robotResult.Item;
  
      // Return the delivery and robot details
      res.json({
        ...delivery,
        robotName: robot.name,
        robotLocation: {
          latitude: robot.currentLatitude,
          longitude: robot.currentLongitude
        }
      });
    } catch (error) {
      console.error('Error fetching delivery:', error);
      res.status(500).json({ error: error.message });
    }
  });
  

// Open door for the current delivery
router.put('/deliveries/:deliveryId/opendoor', async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.body;

  try {
      const delivery = await dynamodb.get({
          TableName: 'Deliveries',
          Key: { id: deliveryId }
      }).promise();

      if (!delivery.Item) {
          return res.status(404).json({ error: 'Delivery not found' });
      }
      if (!delivery.Item) {
        return res.status(404).json({ error: 'Delivery not found' });
      }
  
      if (delivery.Item.ownerId !== ownerId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
  
      if (delivery.Item.status !== 'in_progress') {
        return res.status(400).json({ error: 'Delivery is not in progress' });
      }

      // Send a command to the robot to open the door
      const robotTopic = `robot/${delivery.Item.robotId}/command`;
      const message = JSON.stringify({
          action: 'open_door'
      });

      mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
          if (error) {
              console.error('Error publishing MQTT message:', error);
              // Handle the error appropriately (e.g., retry)
          } else {
              console.log('MQTT message published successfully');
          }
      });

      res.json({ message: 'Face verified and Opening door' });
  } catch (error) {
      console.error('Error opening door:', error);
      res.status(500).json({ error: error.message });
  }
});
 

// Update Delivery Status to Completed
router.put('/deliveries/:deliveryId/complete', async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.body;

  try {
    // Get delivery details
    const delivery = await dynamodb.get({
      TableName: 'Deliveries',
      Key: { id: deliveryId }
    }).promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (delivery.Item.status !== 'in_progress') {
      return res.status(400).json({ error: 'Delivery is not in progress' });
    }

    // Update delivery status
    await dynamodb.update({
      TableName: 'Deliveries',
      Key: { id: deliveryId },
      UpdateExpression: 'set #status = :status, endTime = :endTime',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':endTime': new Date().toISOString()
      }
    }).promise();

    // Update robot status
    await dynamodb.update({
      TableName: 'Robots',
      Key: {
        id: delivery.Item.robotId,
        communityId: delivery.Item.communityId
      },
      UpdateExpression: 'set #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    }).promise();

    const baseLocation = {  // later we will retrive battery station location here
      latitude: 25.1234,
      longitude: 55.5678
    };
    const robotTopic = `robot/${delivery.Item.robotId}/command`;
    const message = JSON.stringify({
        action: 'go_to_base',
        baseLocation: baseLocation
    });
    mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
      if (error) {
          console.error('Error publishing MQTT message:', error);
          // Handle the error appropriately (e.g., retry, rollback delivery completion)
      } else {
          console.log('MQTT message published successfully', message);
      }
    });

    res.json({ message: 'Delivery completed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Completed Deliveries for Owner
router.get('/deliveries/completed/:ownerId', async (req, res) => {
  try {
    const deliveries = await dynamodb.query({
      TableName: 'Deliveries',
      IndexName: 'OwnerDeliveryIndex',
      KeyConditionExpression: 'ownerId = :ownerId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':ownerId': req.params.ownerId,
        ':status': 'completed'
      }
    }).promise();

    // Get robot details for each delivery
    const deliveriesWithDetails = await Promise.all(
      deliveries.Items.map(async (delivery) => {
        const robot = await dynamodb.get({
          TableName: 'Robots',
          Key: { 
            id: delivery.robotId,
            communityId: delivery.communityId
          }
        }).promise();

        return {
          ...delivery,
          robotName: robot.Item.name,
          deliveryDuration: delivery.endTime 
            ? Math.round((new Date(delivery.endTime) - new Date(delivery.startTime)) / 1000 / 60) 
            : null // Duration in minutes
        };
      })
    );

    res.json(deliveriesWithDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Raise a Ticket
router.post('/tickets', async (req, res) => {
  const { 
    ownerId, 
    robotId, 
    deliveryId, 
    issueType, 
    description,
    communityId 
  } = req.body;

  try {
    // Validate if the delivery belongs to the owner
    const delivery = await dynamodb.get({
      TableName: 'Deliveries',
      Key: { id: deliveryId }
    }).promise();

    if (!delivery.Item || delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: 'Unauthorized or delivery not found' });
    }

    const ticket = {
      id: `tick-${uuidv4()}`,
      ownerId,
      robotId,
      deliveryId,
      issueType,
      description,
      status: 'open',
      priority: 'medium', // Default priority
      communityId,
      createdAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Tickets',
      Item: ticket
    }).promise();

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;