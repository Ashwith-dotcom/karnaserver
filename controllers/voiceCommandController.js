const express = require('express');
const router = express.Router();
const { DynamoDB } = require('aws-sdk');
const mqtt = require('mqtt');

// Initialize DynamoDB
const dynamodb = new DynamoDB.DocumentClient();

// MQTT Client setup
const mqttClient = mqtt.connect({
  protocol: 'mqtts',
  host: '65f02f33157749ed9e713a070f930f6e.s1.eu.hivemq.cloud',
  port: 8883,
  username: 'robotclient',
  password: 'Robothive@234'
});

// Command patterns
const COMMAND_PATTERNS = {
  OPEN_DOOR: /(open|unlock) (the |)door/i,
  CHECK_STATUS: /(where|track|status) (of |)(my |)delivery/i,
  WAIT_ROBOT: /(wait|hold|stay) (for |)(\d+ minutes|a moment)/i,
  CANCEL_DELIVERY: /(cancel|stop) (the |)(delivery|order)/i,
  HELP: /(help|assist|support)/i
};

router.post('/api/voice-command', async (req, res) => {
  try {
    const { command } = req.body;
    const userId = req.user.id; // Assuming auth middleware sets this

    const delivery = await getActiveDelivery(userId);
    const response = await processCommand(command, delivery, userId);
    
    res.json(response);
  } catch (error) {
    console.error('Voice command error:', error);
    res.status(500).json({
      success: false,
      response: 'Sorry, something went wrong. Please try again.',
      error: error.message
    });
  }
});

async function processCommand(command, delivery, userId) {
  const normalizedCommand = command.toLowerCase();

  // Check if user has active delivery
  if (!delivery && !COMMAND_PATTERNS.HELP.test(normalizedCommand)) {
    return {
      success: true,
      response: "You don't have any active deliveries at the moment."
    };
  }

  // Process different commands
  if (COMMAND_PATTERNS.OPEN_DOOR.test(normalizedCommand)) {
    return await handleOpenDoor(delivery);
  } 
  else if (COMMAND_PATTERNS.CHECK_STATUS.test(normalizedCommand)) {
    return await handleCheckStatus(delivery);
  }
  else if (COMMAND_PATTERNS.WAIT_ROBOT.test(normalizedCommand)) {
    return await handleWaitCommand(delivery, normalizedCommand);
  }
  else if (COMMAND_PATTERNS.CANCEL_DELIVERY.test(normalizedCommand)) {
    return await handleCancelDelivery(delivery);
  }
  else if (COMMAND_PATTERNS.HELP.test(normalizedCommand)) {
    return handleHelp();
  }
  
  return {
    success: true,
    response: "I'm not sure what you want. You can ask me to open the door, check delivery status, or ask for help."
  };
}

async function handleOpenDoor(delivery) {
  const robotTopic = `robot/${delivery.robotId}/command`;
  const message = {
    action: "open_door",
    deliveryId: delivery.deliveryId
  };

  return new Promise((resolve, reject) => {
    mqttClient.publish(robotTopic, JSON.stringify(message), { qos: 1 }, (error) => {
      if (error) {
        reject(new Error('Failed to send command to robot'));
      }

      resolve({
        success: true,
        response: "Opening robot door. Please enter the OTP shown on your screen.",
        action: {
          type: 'OPEN_DOOR',
          deliveryId: delivery.deliveryId
        }
      });
    });
  });
}

async function handleCheckStatus(delivery) {
  return {
    success: true,
    response: `Your delivery is ${delivery.status}. ${
      delivery.eta ? `Estimated arrival in ${delivery.eta} minutes.` : ''
    }`,
    action: {
      type: 'SHOW_STATUS',
      deliveryId: delivery.deliveryId
    }
  };
}

async function handleWaitCommand(delivery, command) {
  const minutesMatch = command.match(/\d+/);
  const waitTime = minutesMatch ? parseInt(minutesMatch[0]) : 5;
  
  const robotTopic = `robot/${delivery.robotId}/command`;
  const message = {
    action: "wait",
    deliveryId: delivery.deliveryId,
    duration: waitTime * 60 // Convert to seconds
  };

  return new Promise((resolve, reject) => {
    mqttClient.publish(robotTopic, JSON.stringify(message), { qos: 1 }, (error) => {
      if (error) {
        reject(new Error('Failed to send wait command to robot'));
      }

      resolve({
        success: true,
        response: `I've asked the robot to wait for ${waitTime} minutes.`,
        action: {
          type: 'ROBOT_WAIT',
          deliveryId: delivery.deliveryId,
          duration: waitTime
        }
      });
    });
  });
}

async function handleCancelDelivery(delivery) {
  // Update delivery status in DynamoDB
  await dynamodb.update({
    TableName: 'Deliveries',
    Key: { deliveryId: delivery.deliveryId },
    UpdateExpression: 'SET #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': 'CANCELLED' }
  }).promise();

  // Notify robot
  const robotTopic = `robot/${delivery.robotId}/command`;
  const message = {
    action: "cancel_delivery",
    deliveryId: delivery.deliveryId
  };

  return new Promise((resolve, reject) => {
    mqttClient.publish(robotTopic, JSON.stringify(message), { qos: 1 }, (error) => {
      if (error) {
        reject(new Error('Failed to send cancel command to robot'));
      }

      resolve({
        success: true,
        response: "Your delivery has been cancelled. The robot will return to base.",
        action: {
          type: 'DELIVERY_CANCELLED',
          deliveryId: delivery.deliveryId
        }
      });
    });
  });
}

function handleHelp() {
  return {
    success: true,
    response: `Here's what I can help you with:
    1. Open the robot door
    2. Check your delivery status
    3. Ask the robot to wait
    4. Cancel your delivery
    Just speak naturally and I'll understand your request.`,
    action: {
      type: 'SHOW_HELP'
    }
  };
}

async function getActiveDelivery(userId) {
  const result = await dynamodb.query({
    TableName: 'Deliveries',
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: '#status IN (:pending, :inProgress)',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':userId': userId,
      ':pending': 'PENDING',
      ':inProgress': 'IN_PROGRESS'
    }
  }).promise();

  return result.Items[0];
}

module.exports = router;
