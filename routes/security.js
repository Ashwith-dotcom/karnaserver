const express = require("express");
const router = express.Router();
const { dynamodb } = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const mqtt = require("mqtt");
const axios = require("axios");

const FAST2SMS_API_KEY =
  "SDWawcVxsM4Bjdy5pYE1l7gLeAT8JCnNFt2ihKbGRQ6UqofXHzv8DhpfJXyxIintbEWB6QkowAz9CYgK";
const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

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
    const result = await dynamodb
      .scan({
        TableName: "OTPVerification",
      })
      .promise();

    const now = new Date();

    // Delete expired or verified OTPs
    for (const item of result.Items) {
      if (new Date(item.expiryTime) < now || item.verified) {
        await dynamodb
          .delete({
            TableName: "OTPVerification",
            Key: { phoneNumber: item.phoneNumber },
          })
          .promise();
      }
    }
  } catch (error) {
    console.error("Error cleaning up OTPs:", error);
  }
}

setInterval(cleanupOTPs, 60 * 60 * 1000);

router.post("/signup", async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    // Check if phone number already exists
    const existingUser = await dynamodb
      .query({
        TableName: "Securities",
        IndexName: "PhoneNumberIndex",
        KeyConditionExpression: "phoneNumber = :phoneNumber",
        ExpressionAttributeValues: {
          ":phoneNumber": phoneNumber,
        },
      })
      .promise();

    if (existingUser.Items.length > 0) {
      return res.status(400).json({ error: "Phone number already registered" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000).toISOString(); // 5 minutes expiry

    await dynamodb
      .put({
        TableName: "OTPVerification",
        Item: {
          phoneNumber,
          otp,
          expiryTime,
          verified: false,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    const response = await axios.post(
      FAST2SMS_URL,
      {
        route: "otp",
        // sender_id: "TXTIND",
        variables_values: `${otp}`,
        numbers: phoneNumber,
      },
      {
        headers: { Authorization: FAST2SMS_API_KEY },
      }
    );
    console.log("Fast2SMS Response:", response.data);

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Signup OTP error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-signup-otp", async (req, res) => {
  const {
    phoneNumber,
    otp,
    name,
    communityId,
    currentLatitude,
    currentLongitude,
  } = req.body;

  try {
    const result = await dynamodb
      .query({
        TableName: "OTPVerification",
        KeyConditionExpression: "phoneNumber = :phoneNumber",
        ExpressionAttributeValues: { ":phoneNumber": phoneNumber },
      })
      .promise();

    if (
      result.Items.length === 0 ||
      result.Items[0].otp !== otp ||
      new Date(result.Items[0].expiryTime) < new Date()
    ) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Delete verified OTP
    await dynamodb
      .delete({ TableName: "OTPVerification", Key: { phoneNumber } })
      .promise();

    // Create owner record
    const security = {
      id: `sec-${uuidv4()}`,
      communityId,
      name,
      phoneNumber,
      currentLatitude,
      currentLongitude,
      createdAt: new Date().toISOString(),
    };

    await dynamodb
      .put({
        TableName: "Securities",
        Item: security,
      })
      .promise();

    res.status(201).json({ message: "Signup successful", security });
  } catch (error) {
    console.error("Verify signup OTP error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Security Login
router.post("/login", async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const result = await dynamodb
      .query({
        TableName: "Securities",
        IndexName: "PhoneNumberIndex",
        KeyConditionExpression: "phoneNumber = :phoneNumber",
        ExpressionAttributeValues: {
          ":phoneNumber": phoneNumber,
        },
      })
      .promise();

    if (result.Items.length === 0) {
      return res.status(404).json({ error: "Security not found" });
    }

    // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // const expiryTime = new Date(Date.now() + 5 * 60000); // 5 minutes expiry

    // // Delete any existing OTP for this phone number
    // await dynamodb.delete({
    //   TableName: "OTPVerification",
    //   Key: { phoneNumber }
    // }).promise();

    // // Store OTP in DynamoDB
    // await dynamodb.put({
    //   TableName: "OTPVerification",
    //   Item: {
    //     phoneNumber,
    //     otp,
    //     expiryTime: expiryTime.toISOString(),
    //     verified: false,
    //     createdAt: new Date().toISOString()
    //   }
    // }).promise();
    res.json({
      message: "Login successful",
      userId: result.Items[0].id,
      communityId: result.Items[0].communityId,
    });
    // const response = await axios.post(FAST2SMS_URL, {
    //       route: "otp",
    //       variables_values: `${otp}`,
    //       numbers: phoneNumber,
    //     }, {
    //       headers: {
    //         'Authorization': FAST2SMS_API_KEY
    //       }
    //     });

    //     if (response.data.return === true) {
    //       res.json({
    //         message: "OTP sent successfully",
    //         userId: result.Items[0].id,
    //         communityId: result.Items[0].communityId
    //       });
    //     } else {
    //       throw new Error("Failed to send OTP");
    //     }
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/resend-otp", async (req, res) => {
  const { phoneNumber, isSignup } = req.body;

  try {
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60000).toISOString();

    // Store OTP in DynamoDB
    await dynamodb
      .put({
        TableName: "OTPVerification",
        Item: {
          phoneNumber,
          otp,
          expiryTime,
          verified: false,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    // Send OTP via Fast2SMS
    await axios.post(
      FAST2SMS_URL,
      {
        route: "v3",
        sender_id: "TXTIND",
        message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
        language: "english",
        numbers: phoneNumber,
      },
      { headers: { Authorization: FAST2SMS_API_KEY } }
    );

    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, otp } = req.body;

  try {
    // Get stored OTP details
    const result = await dynamodb
      .query({
        TableName: "OTPVerification",
        KeyConditionExpression: "phoneNumber = :phoneNumber",
        FilterExpression: "verified = :verified",
        ExpressionAttributeValues: {
          ":phoneNumber": phoneNumber,
          ":verified": false,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
      .promise();

    if (result.Items.length === 0) {
      return res
        .status(400)
        .json({ error: "No OTP found or already verified" });
    }

    const otpRecord = result.Items[0];

    // Check if OTP has expired
    if (new Date(otpRecord.expiryTime) < new Date()) {
      // Delete expired OTP
      await dynamodb
        .delete({
          TableName: "OTPVerification",
          Key: { phoneNumber },
        })
        .promise();
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Delete verified OTP
    await dynamodb
      .delete({
        TableName: "OTPVerification",
        Key: { phoneNumber },
      })
      .promise();

    // Get user details
    const userResult = await dynamodb
      .query({
        TableName: "Securities",
        IndexName: "PhoneNumberIndex",
        KeyConditionExpression: "phoneNumber = :phoneNumber",
        ExpressionAttributeValues: {
          ":phoneNumber": phoneNumber,
        },
      })
      .promise();

    if (userResult.Items.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "OTP verified successfully",
      user: userResult.Items[0],
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: error.message });
  }
});

router.put("/location/:securityId", async (req, res) => {
  const { securityId } = req.params;
  const { currentLatitude, currentLongitude } = req.body;

  try {
    // 1. Use a query to find the security guard with the given ID
    const securityQuery = await dynamodb
      .query({
        TableName: "Securities",
        KeyConditionExpression: "id = :securityId",
        ExpressionAttributeValues: {
          ":securityId": securityId,
        },
      })
      .promise();

    if (securityQuery.Items.length === 0) {
      return res.status(404).json({ error: "Security guard not found" });
    }

    const securityItem = securityQuery.Items[0];
    const communityId = securityItem.communityId;

    // 2. Update security location using both HASH and RANGE keys
    await dynamodb
      .update({
        TableName: "Securities",
        Key: {
          id: securityId,
          communityId: communityId,
        },
        UpdateExpression:
          "set currentLatitude = :latitude, currentLongitude = :longitude",
        ExpressionAttributeValues: {
          ":latitude": currentLatitude,
          ":longitude": currentLongitude,
        },
        ReturnValues: "UPDATED_NEW",
      })
      .promise();

    res.json({ message: "Location updated successfully" });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new delivery
router.post("/deliveries", async (req, res) => {
  const { securityId, villaNumber, deliveryType } = req.body;

  try {
    // Get security details with both id and communityId
    const securityData = await dynamodb
      .scan({
        TableName: "Securities",
        FilterExpression: "id = :securityId",
        ExpressionAttributeValues: {
          ":securityId": securityId,
        },
      })
      .promise();

    if (!securityData.Items || securityData.Items.length === 0) {
      return res.status(404).json({ error: "Security not found" });
    }

    const security = securityData.Items[0];

    // Get villa owner details
    const ownerData = await dynamodb
      .scan({
        TableName: "VillaOwners",
        FilterExpression:
          "villaNumber = :villaNumber AND communityId = :communityId",
        ExpressionAttributeValues: {
          ":villaNumber": villaNumber,
          ":communityId": security.communityId,
        },
      })
      .promise();

    if (ownerData.Items.length === 0) {
      return res.status(404).json({ error: "Villa not found" });
    }

    // Get available robot in the community
    const robotData = await dynamodb
      .scan({
        TableName: "Robots",
        FilterExpression: "#status = :status AND communityId = :communityId",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "active",
          ":communityId": security.communityId,
        },
      })
      .promise();

    if (robotData.Items.length === 0) {
      return res.status(400).json({ error: "No available robots" });
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
      status: "in_progress",
      startTime: new Date().toISOString(),
      startLatitude: security.currentLatitude,
      startLongitude: security.currentLongitude,
      endLatitude: owner.latitude,
      endLongitude: owner.longitude,
      createdAt: new Date().toISOString(),
    };

    await dynamodb
      .put({
        TableName: "Deliveries",
        Item: delivery,
      })
      .promise();

    // Update robot status using both primary key elements
    await dynamodb
      .update({
        TableName: "Robots",
        Key: {
          id: robot.id,
          communityId: robot.communityId,
        },
        UpdateExpression: "set #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "delivering",
        },
      })
      .promise();
    const robotTopic = `robot/${robot.id}/command`;
    const message = JSON.stringify({
      securityId: security.id,
      ownerId: owner.id,
      ownervilla: owner.villaNumber,
      deliveryId: delivery.id,
      action: "start_delivery",
      ownerLocation: {
        latitude: owner.latitude,
        longitude: owner.longitude,
      },
    });

    mqttClient.publish(robotTopic, message, { qos: 1 }, (error) => {
      if (error) {
        console.error("Error publishing MQTT message:", error);
        // Handle the error appropriately (e.g., retry, rollback delivery)
      } else {
        console.log("MQTT message published successfully", message);
      }
    });

    res.status(201).json(delivery);
  } catch (error) {
    console.error("Delivery error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
