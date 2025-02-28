require('dotenv').config();
const express = require('express');

const cors = require('cors');
const {dynamodb} = require('./config/db')
const bodyParser = require("body-parser")


const app = express();

app.use(bodyParser.json({ limit: "50mb" }))
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }))


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const dashboardRoutes = require('./routes/dashboard');
const securityRoutes = require("./routes/security")
const ownerRoutes = require("./routes/owner")
const voiceCommandController = require('./controllers/voiceCommandController')

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/security', securityRoutes)
app.use('/api/owner', ownerRoutes)
app.use('/api' , voiceCommandController)


const PORT = process.env.PORT;

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
