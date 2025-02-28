const express = require("express");
const router = express.Router();
const { dynamodb } = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const mqtt = require("mqtt");
const AWS = require("aws-sdk");
const crypto = require("crypto");
const axios = require('axios');


const FAST2SMS_API_KEY = 'SDWawcVxsM4Bjdy5pYE1l7gLeAT8JCnNFt2ihKbGRQ6UqofXHzv8DhpfJXyxIintbEWB6QkowAz9CYgK';
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';


AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const mqttClient = mqtt.connect({
  host: "65f02f33157749ed9e713a070f930f6e.s1.eu.hivemq.cloud",
  port: 8883,
  protocol: "mqtts",
  clientId: "client-server",
  username: "serverclient",
  password: "Serverhive@234",
  rejectUnauthorized: true,
});

async function cleanupOTPs() {
  try {
    // Get all OTP records
    const result = await dynamodb.scan({
      TableName: "OTPVerification"
    }).promise();

    const now = new Date();
    
    // Delete expired or verified OTPs
    for (const item of result.Items) {
      if (new Date(item.expiryTime) < now || item.verified) {
        await dynamodb.delete({
          TableName: "OTPVerification",
          Key: { phoneNumber: item.phoneNumber }
        }).promise();
      }
    }
  } catch (error) {
    console.error("Error cleaning up OTPs:", error);
  }
}

// Run cleanup every hour
setInterval(cleanupOTPs, 60 * 60 * 1000);

router.post("/signup", async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    // Check if phone number already exists
    const existingPhone = await dynamodb.query({
      TableName: "VillaOwners",
      IndexName: "PhoneNumberIndex",
      KeyConditionExpression: "phoneNumber = :phoneNumber",
      ExpressionAttributeValues: { ":phoneNumber": phoneNumber },
    }).promise();

    if (existingPhone.Items.length > 0) {
      return res.status(400).json({ error: "Phone number already registered" });
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000).toISOString(); // 5 minutes expiry

    // Store OTP in DynamoDB
    await dynamodb.put({
      TableName: "OTPVerification",
      Item: { phoneNumber, otp, expiryTime, verified: false, createdAt: new Date().toISOString() },
    }).promise();

    // Send OTP via Fast2SMS
    const response = await axios.post(FAST2SMS_URL, {
      route: "otp",
      // sender_id: "TXTIND",
      // message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
      variables_values: `${otp}`,
      // language: "english",
      numbers: phoneNumber,
    }, {
      headers: { 'Authorization': FAST2SMS_API_KEY }
    });
    
    console.log("Fast2SMS Response:", response.data);

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Signup OTP error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-signup-otp", async (req, res) => {
  const { phoneNumber, otp, name, email, communityId, villaNumber, latitude, longitude } = req.body;

  try {
    const result = await dynamodb.query({
      TableName: "OTPVerification",
      KeyConditionExpression: "phoneNumber = :phoneNumber",
      ExpressionAttributeValues: { ":phoneNumber": phoneNumber },
    }).promise();

    if (result.Items.length === 0 || result.Items[0].otp !== otp || new Date(result.Items[0].expiryTime) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Delete verified OTP
    await dynamodb.delete({ TableName: "OTPVerification", Key: { phoneNumber } }).promise();

    // Create owner record
    const owner = {
      id: `own-${uuidv4()}`,
      communityId, villaNumber, name, phoneNumber, email, latitude, longitude,
      createdAt: new Date().toISOString(),
    };
    await dynamodb.put({ TableName: "VillaOwners", Item: owner }).promise();

    res.status(201).json({ message: "Signup successful", owner });
  } catch (error) {
    console.error("Verify signup OTP error:", error);
    res.status(500).json({ error: error.message });
  }
});


router.post("/login", async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    // Check if user exists
    const result = await dynamodb.query({
      TableName: "VillaOwners",
      IndexName: "PhoneNumberIndex",
      KeyConditionExpression: "phoneNumber = :phoneNumber",
      ExpressionAttributeValues: {
        ":phoneNumber": phoneNumber
      }
    }).promise();

    if (result.Items.length === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000); // 5 minutes expiry

    // Delete any existing OTP for this phone number
    await dynamodb.delete({
      TableName: "OTPVerification",
      Key: { phoneNumber }
    }).promise();
    
    // Store OTP in DynamoDB
    await dynamodb.put({
      TableName: "OTPVerification",
      Item: {
        phoneNumber,
        otp,
        expiryTime: expiryTime.toISOString(),
        verified: false,
        createdAt: new Date().toISOString()
      }
    }).promise();

    // Send OTP via Fast2SMS
    const response = await axios.post(FAST2SMS_URL, {
      route: "otp",
      // sender_id: "TXTIND",
      // message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
      variables_values: `${otp}`,
      // language: "english",
      numbers: phoneNumber,
    }, {
      headers: {
        'Authorization': FAST2SMS_API_KEY
      }
    });

    if (response.data.return === true) {
      res.json({ 
        message: "OTP sent successfully",
        userId: result.Items[0].id,
        communityId: result.Items[0].communityId
      });
    } else {
      throw new Error("Failed to send OTP");
    }
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ error: error.message });
  }
});


router.post("/resend-otp", async (req, res) => {
  const { phoneNumber, isSignup } = req.body;

  try {
    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000).toISOString();

    // Store OTP in DynamoDB
    await dynamodb.put({
      TableName: "OTPVerification",
      Item: { phoneNumber, otp, expiryTime, verified: false, createdAt: new Date().toISOString() },
    }).promise();

    // Send OTP via Fast2SMS
    await axios.post(FAST2SMS_URL, {
      route: "v3",
      sender_id: "TXTIND",
      message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
      language: "english",
      numbers: phoneNumber,
    }, { headers: { 'Authorization': FAST2SMS_API_KEY } });

    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({ error: error.message });
  }
});
router.post("/send-otp", async (req, res) => {
  const { phoneNumber } = req.body;
  
  try {
    // Clean up any existing OTPs for this phone number
    await dynamodb.delete({
      TableName: "OTPVerification",
      Key: { phoneNumber }
    }).promise();

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000); // 5 minutes expiry
    
    // Store OTP in DynamoDB
    await dynamodb.put({
      TableName: "OTPVerification",
      Item: {
        phoneNumber,
        otp,
        expiryTime: expiryTime.toISOString(),
        verified: false,
        createdAt: new Date().toISOString()
      }
    }).promise();

    // Send OTP via Fast2SMS
    const response = await axios.post(FAST2SMS_URL, {
      route: "v3",
      sender_id: "TXTIND",
      message: `Your OTP for login is: ${otp}. Valid for 5 minutes.`,
      language: "english",
      numbers: phoneNumber
    }, {
      headers: {
        'Authorization': FAST2SMS_API_KEY
      }
    });

    if (response.data.return === true) {
      res.json({ message: "OTP sent successfully" });
    } else {
      throw new Error("Failed to send OTP");
    }
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add route for verifying OTP
router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, otp } = req.body;

  try {
    // Get stored OTP details
    const result = await dynamodb.query({
      TableName: "OTPVerification",
      KeyConditionExpression: "phoneNumber = :phoneNumber",
      FilterExpression: "verified = :verified",
      ExpressionAttributeValues: {
        ":phoneNumber": phoneNumber,
        ":verified": false
      },
      ScanIndexForward: false,
      Limit: 1
    }).promise();

    if (result.Items.length === 0) {
      return res.status(400).json({ error: "No OTP found or already verified" });
    }

    const otpRecord = result.Items[0];

    // Check if OTP has expired
    if (new Date(otpRecord.expiryTime) < new Date()) {
      // Delete expired OTP
      await dynamodb.delete({
        TableName: "OTPVerification",
        Key: { phoneNumber }
      }).promise();
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Delete verified OTP
    await dynamodb.delete({
      TableName: "OTPVerification",
      Key: { phoneNumber }
    }).promise();

    // Get user details
    const userResult = await dynamodb.query({
      TableName: "VillaOwners",
      IndexName: "PhoneNumberIndex",
      KeyConditionExpression: "phoneNumber = :phoneNumber",
      ExpressionAttributeValues: {
        ":phoneNumber": phoneNumber
      }
    }).promise();

    if (userResult.Items.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "OTP verified successfully",
      user: userResult.Items[0]
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get Current Delivery Status
router.get("/delivery/current/:ownerId", async (req, res) => {
  try {
    const { ownerId } = req.params;

    console.log("Querying for ownerId:", ownerId);

    // Query to get deliveries for the owner
    const deliveriesResult = await dynamodb
      .query({
        TableName: "Deliveries",
        IndexName: "OwnerDeliveryIndex",
        KeyConditionExpression: "ownerId = :ownerId",
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":ownerId": ownerId,
          ":status": "in_progress",
        },
      })
      .promise();

    if (!deliveriesResult.Items || deliveriesResult.Items.length === 0) {
      return res.json({ message: "No in-progress deliveries found" });
    }

    const delivery = deliveriesResult.Items[0];
    console.log("Delivery found:", delivery);

    // Validate communityId presence
    if (!delivery.communityId) {
      throw new Error("Missing communityId in delivery data");
    }

    // Fetch robot details
    const robotResult = await dynamodb
      .get({
        TableName: "Robots",
        Key: {
          id: delivery.robotId,
          communityId: delivery.communityId,
        },
      })
      .promise();

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
        longitude: robot.currentLongitude,
      },
    });
  } catch (error) {
    console.error("Error fetching delivery:", error);
    res.status(500).json({ error: error.message });
  }
});




router.post("/deliveries/:deliveryId/verify-otp", async (req, res) => {
  const { deliveryId } = req.params;
  const { otp, ownerId } = req.body;

  try {
    const delivery = await dynamodb.get({
      TableName: "Deliveries",
      Key: { id: deliveryId },
    }).promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // ✅ Allow verification when status is either "otp_pending" or "in_progress"
    if (!["otp_pending", "in_progress"].includes(delivery.Item.status)) {
      return res.status(400).json({ error: "Delivery is not in correct state for OTP verification" });
    }

    // Check if OTP exists and hasn't expired
    if (!delivery.Item.otp || !delivery.Item.otpExpiry) {
      return res.status(400).json({ error: "No valid OTP found" });
    }

    if (new Date(delivery.Item.otpExpiry) < new Date()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    if (delivery.Item.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // ✅ Update delivery status to "otp_verified"
    await dynamodb.update({
      TableName: "Deliveries",
      Key: { id: deliveryId },
      UpdateExpression: "set #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "otp_verified" },
    }).promise();

    // ✅ Clear OTP after successful verification
    await dynamodb.update({
      TableName: "Deliveries",
      Key: { id: deliveryId },
      UpdateExpression: "remove otp, otpExpiry",
    }).promise();

    // ✅ Send command to open door via MQTT
    const robotTopic = `robot/${delivery.Item.robotId}/command`;
    const message = JSON.stringify({ action: "open_door", deliveryId: deliveryId });

    mqttClient.publish(robotTopic, message, { qos: 1 });

    res.json({ message: "OTP verified and door opening" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: error.message });
  }
});


router.post("/deliveries/:deliveryId/generate-otp", async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.body;

  try {
    const delivery = await dynamodb.get({
      TableName: "Deliveries",
      Key: { id: deliveryId },
    }).promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!["in_progress", "otp_pending"].includes(delivery.Item.status)) {
      return res.status(400).json({ error: "Delivery is not in correct state for OTP generation" });
    }

    // Generate 4-digit OTP
    const otp = crypto.randomInt(1000, 9999).toString().padStart(4, "0");

    // Store OTP in delivery record with 5-minute expiration
    await dynamodb.update({
      TableName: "Deliveries",
      Key: { id: deliveryId },
      UpdateExpression: "set otp = :otp, otpExpiry = :expiry, #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":otp": otp,
        ":expiry": new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        ":status": "otp_pending", // ✅ Set status to "otp_pending"
      },
    }).promise();

    // Send OTP to robot via MQTT
    const robotTopic = `robot/${delivery.Item.robotId}/command`;
    const message = JSON.stringify({ action: "set_otp", otp: otp, deliveryId: deliveryId });

    mqttClient.publish(robotTopic, message, { qos: 1 });

    res.json({ otp });
  } catch (error) {
    console.error("Error generating OTP:", error);
    res.status(500).json({ error: error.message });
  }
});


router.get("/deliveries/:deliveryId/otp-status", async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.query;

  try {
    const delivery = await dynamodb
      .get({
        TableName: "Deliveries",
        Key: { id: deliveryId },
      })
      .promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if OTP has been verified
    const verified = delivery.Item.status === "otp_verified";
    const expired = delivery.Item.otpExpiry && new Date(delivery.Item.otpExpiry) < new Date();

    // If OTP has expired but status wasn't updated, update it now
    if (expired && delivery.Item.status === "otp_pending") {
      await dynamodb
        .update({
          TableName: "Deliveries",
          Key: { id: deliveryId },
          UpdateExpression: "set #status = :status remove otp, otpExpiry",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "in_progress",
          },
        })
        .promise();
    }

    res.json({ 
      verified,
      status: delivery.Item.status,
      expired: expired && !verified
    });
  } catch (error) {
    console.error("Error checking OTP status:", error);
    res.status(500).json({ error: error.message });
  }
});
router.get("/deliveries/:deliveryId", async (req, res) => {
  const { deliveryId } = req.params;

  try {
    const delivery = await dynamodb
      .get({
        TableName: "Deliveries",
        Key: { id: deliveryId },
      })
      .promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    res.json({
      deliveryId: deliveryId,
      ownerId: delivery.Item.ownerId, // Send ownerId
    });
  } catch (error) {
    console.error("Error fetching delivery details:", error);
    res.status(500).json({ error: error.message });
  }
});

// Open door for the current delivery
router.put("/deliveries/:deliveryId/opendoor", async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.body;

  try {
    const delivery = await dynamodb
      .get({
        TableName: "Deliveries",
        Key: { id: deliveryId },
      })
      .promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }
    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (delivery.Item.status !== "in_progress") {
      return res.status(400).json({ error: "Delivery is not in progress" });
    }

    // Send a command to the robot to open the door
    const robotTopic = `robot/${delivery.Item.robotId}/command`;
    const message = JSON.stringify({
      action: "open_door",
    });

    mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
      if (error) {
        console.error("Error publishing MQTT message:", error);
        // Handle the error appropriately (e.g., retry)
      } else {
        console.log("MQTT message published successfully");
      }
    });

    res.json({ message: "Face verified and Opening door" });
  } catch (error) {
    console.error("Error opening door:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update Delivery Status to Completed
router.put("/deliveries/:deliveryId/complete", async (req, res) => {
  const { deliveryId } = req.params;
  const { ownerId } = req.body;

  try {
    // Get delivery details
    const delivery = await dynamodb
      .get({
        TableName: "Deliveries",
        Key: { id: deliveryId },
      })
      .promise();

    if (!delivery.Item) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    if (delivery.Item.ownerId !== ownerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!["in_progress", "otp_verified"].includes(delivery.Item.status)) {
      return res.status(400).json({ error: "Delivery is not in the correct state to complete." });
    }
    

    // Update delivery status
    await dynamodb
      .update({
        TableName: "Deliveries",
        Key: { id: deliveryId },
        UpdateExpression: "set #status = :status, endTime = :endTime",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "completed",
          ":endTime": new Date().toISOString(),
        },
      })
      .promise();

    // Update robot status
    await dynamodb
      .update({
        TableName: "Robots",
        Key: {
          id: delivery.Item.robotId,
          communityId: delivery.Item.communityId,
        },
        UpdateExpression: "set #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "active",
        },
      })
      .promise();

    const baseLocation = {
      // later we will retrive battery station location here
      latitude: 25.1234,
      longitude: 55.5678,
    };
    const robotTopic = `robot/${delivery.Item.robotId}/command`;
    const message = JSON.stringify({
      action: "go_to_base",
      baseLocation: baseLocation,
    });
    mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
      if (error) {
        console.error("Error publishing MQTT message:", error);
        // Handle the error appropriately (e.g., retry, rollback delivery completion)
      } else {
        console.log("MQTT message published successfully", message);
      }
    });

    res.json({ message: "Delivery completed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Completed Deliveries for Owner
router.get("/deliveries/completed/:ownerId", async (req, res) => {
  try {
    const deliveries = await dynamodb
      .query({
        TableName: "Deliveries",
        IndexName: "OwnerDeliveryIndex",
        KeyConditionExpression: "ownerId = :ownerId",
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":ownerId": req.params.ownerId,
          ":status": "completed",
        },
      })
      .promise();

    // Get robot details for each delivery
    const deliveriesWithDetails = await Promise.all(
      deliveries.Items.map(async (delivery) => {
        const robot = await dynamodb
          .get({
            TableName: "Robots",
            Key: {
              id: delivery.robotId,
              communityId: delivery.communityId,
            },
          })
          .promise();

        return {
          ...delivery,
          robotName: robot.Item.name,
          deliveryDuration: delivery.endTime
            ? Math.round(
                (new Date(delivery.endTime) - new Date(delivery.startTime)) /
                  1000 /
                  60
              )
            : null, // Duration in minutes
        };
      })
    );

    res.json(deliveriesWithDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Raise a Ticket
router.post("/tickets", async (req, res) => {
  const { ownerId, robotId, deliveryId, issueType, description, communityId } =
    req.body;

  try {
    // Validate if the delivery belongs to the owner
    const delivery = await dynamodb
      .get({
        TableName: "Deliveries",
        Key: { id: deliveryId },
      })
      .promise();

    if (!delivery.Item || delivery.Item.ownerId !== ownerId) {
      return res
        .status(403)
        .json({ error: "Unauthorized or delivery not found" });
    }

    const ticket = {
      id: `tick-${uuidv4()}`,
      ownerId,
      robotId,
      deliveryId,
      issueType,
      description,
      status: "open",
      priority: "medium", // Default priority
      communityId,
      createdAt: new Date().toISOString(),
    };

    await dynamodb
      .put({
        TableName: "Tickets",
        Item: ticket,
      })
      .promise();

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
