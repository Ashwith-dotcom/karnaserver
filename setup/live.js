const { dynamodbAdmin } = require('../config/db');

const ttlParams = {
    TableName: 'OTPVerification',
    TimeToLiveSpecification: {
      AttributeName: 'expiryTime', // Your TTL attribute
      Enabled: true
    }
  };
  
  dynamodbAdmin.updateTimeToLive(ttlParams, function(err, data) {
    if (err) {
      console.error("Error enabling TTL:", err);
    } else {
      console.log("TTL enabled successfully:", data);
    }
  });