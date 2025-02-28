const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');  // Step 1
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// step 2 for JWT, create jwt token in VS Cove Terminal



const verifyJWT = (req, res, next) => {
  // Step 5: check authorized header available or unavailable
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })

}




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xrsgd45.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const usersCollection = client.db('bistroDb').collection('users');

    const menuCollection = client.db('bistroDb').collection('menu');

    const reviewCollection = client.db('bistroDb').collection('reviews');

    const cartCollection = client.db('bistroDb').collection('carts');

    const paymentCollection = client.db('bistroDb').collection('payments');



    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })  // Step 3
      res.send({ token })
    })


    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden Message' })
      }
      next();
    }


    /**
     * 0. Do not show secure links to those who should not show the links
     *1. use jwt token: verifyJWT
     *2. use verifyAdmin middleware
     * **/

    // users related APIs
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })


    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      console.log('Existing User:', existingUser);
      if (existingUser) {
        return res.send({ message: 'User Already Exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })


    // Security layer: verifyJWT
    // email same
    // Check admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })


    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })



    // Menu related API
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem)
      res.send(result);
    })

    app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })




    // REview related API
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })


    // Cart Collection
    app.post('/carts', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })

    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;

      console.log(email);
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    // app.get('/carts/:id', async(req,res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await cartCollection.find(query);
    //   res.send(result);
    // })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })




    // Create Payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price * 100);
      console.log(price, amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })



    // Payment related API
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      res.send(insertResult);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id))} }
      const deleteReslt = await cartCollection.deleteMany(query);
      res.send({ insertResult, deleteReslt });

    })






    app.get('/admin-stats', verifyJWT, verifyAdmin, async(req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);


      // best way to get sum of the price field is to use group and sum operator


      /*
      await paymentsCollection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
      ]).toArray();

      */


      res.send({ users, products, orders, revenue });
    })




    // *Bangla System(second best solution)

    // * 1. Load all payments
    // *2. For each payment, get the menuItems array
    // *3. for each item in the menuItems array get the menuItem from the menu colluction
    // *4. put them in an array: allOrderedItems
    // *5. separate allOrderedItems by category using filter
    // *6. now get the quantity by using length: pizzas.length
    // *7. for each category use reduce to get the total amount spent on this category


    app.get('/order-stats', verifyJWT, verifyAdmin, async(req, res) => {
      const pipeline = [
        {
          $unwind: "$menuItems"
        },
        {
          $lookup: {
            from: "menu",
            localField: "menuItems",
            foreignField: "_id",
            as: "menuItemDetails"
          }
        },
        {
          $unwind: "$menuItemDetails"
        },
        {
          $group: {
            _id: "$menuItemDetails.category",
            itemCount: { $sum: 1 },
            total: { $sum: "$menuItemDetails.price" }
          }
        },
        {
          $project: {
            category: "$_id",
            itemCount: 1,
            total: { $round: ["$total", 2] }
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);

    })





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





app.get('/', (req, res) => {
  res.send('Boss is sitting')
})

app.listen(port, () => {
  console.log(`Bistro Boss is Sitting on Port ${port}`);
})



/**
 *--------------------------------
 *    NAMING CONVENTION
 *--------------------------------
 *users: userCollection
 *app.get('/users')
 * app.get('/users/:id')
 *app.post('/users')
 *app.patch('/users/:id')
 *app.put('/users/:id')
 *app.delete('/users/:id')
 *
 *
 * **/