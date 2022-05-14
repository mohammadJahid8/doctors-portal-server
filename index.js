const express = require('express')
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qqubv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctorsPortal').collection('services');
        const bookingCollection = client.db('doctorsPortal').collection('bookings');
        //api



        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);

        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatmentName: booking.treatmentName, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            //step 1 get all services
            const services = await serviceCollection.find().toArray();
            //step 2 get the bookings of that day, output [{},{},{},{},{},{},{}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            //step 3 for each service , 
            services.forEach(service => {
                //step 4  find bookings for that service output [{},{},{},{}]
                const serviceBookings = bookings.filter(booking => booking.treatmentName === service.name);
                //step 5 select slots for the servie bookings:["","","",""]
                const bookedSlots = serviceBookings.map(book => book.slot);
                //step 6 select those slot that are not in booked slots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7
                service.slots = available;
            })
            res.send(services);

        })



    } finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World! from doctor portal portal')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})