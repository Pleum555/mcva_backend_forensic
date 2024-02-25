// src/controllers/s3Controller.ts
import express, { Router, Request, Response } from 'express';
import { uploadToS3 } from '../services/s3service';

const s3Controller: Router = express.Router();

s3Controller.post('/upload', async (req: Request, res: Response) => {
  try {
    const { file, bucketName, key } = req.body;
    const url = await uploadToS3(file, bucketName, key);
    res.json({ success: true, url });
    // res.json({ success: true, file });
  } catch (error) {
    console.error('Error in S3 upload controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default s3Controller;
