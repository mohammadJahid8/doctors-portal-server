const express = require("express");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const corsOptions = {
  // origin: "https://doctors--portal-6b422.web.app",
  origin: "http://localhost:3000/",
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
//middleware
app.use(cors(corsOptions));
app.use(express.json());

// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
// });

// const http = require("http");
// const server = http.createServer((req, res) => {
//   res.end("Hello Worlds");
// });

const uri = `mongodb+srv://doctor_admin:NqfKinA2drnLWI1C@cluster0.qqubv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctorsPortal").collection("services");
    const bookingCollection = client.db("doctorsPortal").collection("bookings");
    const userCollection = client.db("doctorsPortal").collection("users");
    const doctorCollection = client.db("doctorsPortal").collection("doctors");
    const paymentCollection = client.db("doctorsPortal").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res
          .status(403)
          .send({ message: "You are not authorized to perform this action" });
      }
    };

    //api

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.get("/user", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const idAdmin = user.role === "admin";
      res.send({ admin: idAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const user = req.body;
      console.log(email);
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );

      res.send({ result, token });
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(updateDoc);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatmentName: booking.treatmentName,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });

    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      console.log(doctor);
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctor/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await doctorCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;
      //step 1 get all services
      const services = await serviceCollection.find().toArray();
      //step 2 get the bookings of that day, output [{},{},{},{},{},{},{}]
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //step 3 for each service ,
      services.forEach((service) => {
        //step 4  find bookings for that service output [{},{},{},{}]
        const serviceBookings = bookings.filter(
          (booking) => booking.treatmentName === service.name
        );
        //step 5 select slots for the servie bookings:["","","",""]
        const bookedSlots = serviceBookings.map((book) => book.slot);
        //step 6 select those slot that are not in booked slots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //step 7
        service.slots = available;
      });
      res.send(services);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World! from doctor portalsssssss");
});

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`);
});

// server.listen(5001, () => {
//   const address = server.address();
//   console.log(`Server running at ${server.address()}`);
// });
