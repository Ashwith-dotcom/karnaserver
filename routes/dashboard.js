const {dynamodb} = require('../config/db')
const express = require('express');
const router = express.Router();

// Home page stats
router.get('/stats', async (req, res) => {
  try {
    // Get all robots with their status
    const robotsResponse = await dynamodb.scan({
      TableName: 'Robots',
      ProjectionExpression: 'id, #status',
      ExpressionAttributeNames: {
        '#status': 'status'
      }
    }).promise();

    // Get active robots count
    const activeRobots = robotsResponse.Items.filter(robot => 
      robot.status === 'active'
    ).length;

    // Calculate total robots and non-active robots
    const totalRobots = robotsResponse.Items.length;
    
    // Group robots by status for detailed breakdown
    const robotStatusCount = robotsResponse.Items.reduce((acc, robot) => {
      acc[robot.status] = (acc[robot.status] || 0) + 1;
      return acc;
    }, {});

    // Get total tickets count
    const ticketsResponse = await dynamodb.scan({
      TableName: 'Tickets',
      Select: 'COUNT'
    }).promise();

    // Get total distance (sum of all robots)
    const robotsData = await dynamodb.scan({
      TableName: 'Robots',
      ProjectionExpression: 'totalDistance'
    }).promise();

    const totalDistance = robotsData.Items.reduce((sum, robot) => 
      sum + (robot.totalDistance || 0), 0);

    res.json({
      totalRobots,
      activeRobots,
      nonActiveRobots: totalRobots - activeRobots,
      statusBreakdown: robotStatusCount, 
      totalTickets: ticketsResponse.Count,
      totalDistance: totalDistance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all robots with their locations for map
router.get('/robots/locations', async (req, res) => {
  try {
    const response = await dynamodb.scan({
      TableName: 'Robots',
      ProjectionExpression: 'id, #name, communityId, currentLatitude, currentLongitude, #status, totalDistance ,totalDeliveries, batteryLevel , totalTime',
      ExpressionAttributeNames: {
        '#name': 'name', // Map the reserved keyword to a placeholder
        '#status': 'status'
      }
    }).promise();
    
    res.json(response.Items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get robot details with tickets
router.get('/robots/:robotId', async (req, res) => {
  try {
    // Get robot details
    const robotResponse = await dynamodb.get({
      TableName: 'Robots',
      Key: { id: req.params.robotId }
    }).promise();

    // Get related tickets
    const ticketsResponse = await dynamodb.query({
      TableName: 'Tickets',
      IndexName: 'RobotTicketsIndex',
      KeyConditionExpression: 'robotId = :robotId',
      ExpressionAttributeValues: {
        ':robotId': req.params.robotId
      }
    }).promise();

    // Get community details
    const communityResponse = await dynamodb.get({
      TableName: 'Communities',
      Key: { id: robotResponse.Item.communityId }
    }).promise();

    res.json({
      robot: robotResponse.Item,
      tickets: ticketsResponse.Items,
      community: communityResponse.Item
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all support tickets with related info
router.get('/tickets', async (req, res) => {
  try {
    // Fetch all tickets from the Tickets table
    const ticketsResponse = await dynamodb.scan({
      TableName: 'Tickets'
    }).promise();

    const ticketsWithDetails = await Promise.all(
      ticketsResponse.Items.map(async (ticket) => {
        try {
          // Use communityId from the ticket to query VillaOwners and Robots
          const [ownerResponse, robotResponse] = await Promise.all([
            dynamodb.get({
              TableName: 'VillaOwners',
              Key: { id: ticket.ownerId, communityId: ticket.communityId }
            }).promise(),
            dynamodb.get({
              TableName: 'Robots',
              Key: { id: ticket.robotId, communityId: ticket.communityId }
            }).promise()
          ]);

          // Extract details for the ticket
          const owner = ownerResponse.Item;
          const robot = robotResponse.Item;

          return {
            ...ticket,
            ownerName: owner?.name || 'Unknown Owner',
            robotName: robot?.name || 'Unknown Robot'
          };
        } catch (innerError) {
          console.error(`Error processing ticket ID ${ticket.id}:`, innerError.message);
          return {
            ...ticket,
            ownerName: 'Error fetching owner details',
            robotName: 'Error fetching robot details'
          };
        }
      })
    );

    // Respond with the enriched tickets
    res.json(ticketsWithDetails);
  } catch (error) {
    console.error('Error fetching tickets:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// Get all alerts with related info
router.get('/alerts', async (req, res) => {
  try {
    const alertsResponse = await dynamodb.scan({
      TableName: 'Alerts'
    }).promise();

    // Get related robot and community info for each alert
    const alertsWithDetails = await Promise.all(alertsResponse.Items.map(async alert => {
      const robot = await dynamodb.get({
        TableName: 'Robots',
        Key: { id: alert.robotId }
      }).promise();

      return {
        ...alert,
        robotName: robot.Item.name,
        communityId: robot.Item.communityId
      };
    }));

    res.json(alertsWithDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
