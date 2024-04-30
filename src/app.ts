// app.ts
import express from 'express';
import bodyParser from 'body-parser';
import router from './controllers/s3Controller';
const cors = require('cors');

const app: express.Application = express();
const port: number = Number(process.env.PORT) || 3001;

const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true,
};

app.use(bodyParser.json());
app.use(cors(corsOptions));
app.use('/s3', router);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
