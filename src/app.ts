// app.ts
import express from 'express';
import bodyParser from 'body-parser';
import router from './controllers/s3Controller';
const cors = require('cors');
class App{
  public app: express.Application;
  public port: string | number;
  constructor(){
    this.app = express();
    this.port = 3001;
    this.app.use(bodyParser.json());
    this.initializeCors();
    this.app.use('/s3', router);
    this.app.get('/', (req, res) => {
      res.send('Hello, World!');
    });
  }


  public listen() {
    this.app.listen(this.port, () => {
      console.log(`Server is running at http://localhost:${this.port}`);
    });
  }

  private initializeCors(){
    const corsOptions = {
      origin: 'http://localhost:3001',
      credentials: true,
    };
    this.app.use(cors(corsOptions));
  }
}
export default App;