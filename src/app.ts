// app.ts
import express from 'express';
import bodyParser from 'body-parser';
import router from './controllers/s3Controller';

const app: express.Application = express();
const port: number = Number(process.env.PORT) || 3000;

app.use(bodyParser.json());
app.use('/s3', router);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
