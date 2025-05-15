const express = require('express');
const { Sequelize, Model, DataTypes } = require('sequelize');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite'
});

class User extends Model {}
User.init({
  name: DataTypes.STRING,
  email: DataTypes.STRING,
}, { sequelize, modelName: 'user' });

sequelize.sync();

const init = () => {
  const app = express();

  middleware(app);
  endpoints(app);

  app.listen(3000, () => {
    console.log('Listening on port 3000');
  });
};

const middleware = (app) => {
  app.use(express.json());
  app.use(express.urlencoded({extended: false}));
};

const endpoints = (app) => {
  app.get('/users', async (req, res) => {
    const users = await User.findAll();
    res.json(users);
  });

  app.get('/users/:id', async (req, res) => {
    const user = await User.findByPk(req.params.id);
    res.json(user);
  });

  app.post('/users', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    const user = await User.create({ name, email });
    res.json(user);
  });

  app.put('/users/:id', async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (user) {
      await user.update(req.body);
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  });

  app.delete('/users/:id', async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (user) {
      await user.destroy();
      res.json({ message: 'User deleted' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  });

  app.post('/users/:id/create_order', async (req, res) => {
    const { product, quantity } = req.body;
    const user = await User.findByPk(req.params.id);
    if (user) {
      const orderMessage = JSON.stringify({
        userId: user.id,
        product,
        quantity,
      });
      // Send SQS message
      const params = {
        DelaySeconds: 10,
        MessageBody: orderMessage,
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/147820604610/orders-queue',
      }

      try {
        sqs.sendMessage(params, (err, data) => {
          if (err) {
            console.error('Error sending message to SQS', err);
            return res.status(500).json({ message: 'Error creating order' });
          }
          console.log('Order message sent to SQS', data.MessageId);
        });
        res.json({ message: 'Order created successfully' });
      } catch (error) {
        console.error('Error creating order', error);
        res.status(500).json({ message: 'Error creating order' });
      }
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  });
};

init();