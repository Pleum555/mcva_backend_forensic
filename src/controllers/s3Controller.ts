// src/controllers/s3Controller.ts
import express, { Router, Request, Response } from 'express';
import { uploadToS3, readFileFromS3 } from '../services/s3service';

const s3Controller: Router = express.Router();

// POST request to upload a file to S3
s3Controller.post('/upload', async (req: Request, res: Response) => {
  try {
    // Example JSON body for uploading: { "file_content": { "test": "test" }, "file_name": "test.txt" }
    const { file_content, file_name } = req.body;

    // Assuming "file_content" is a JSON object and "file_name" is a string
    const url = await uploadToS3(file_content, file_name);

    // Respond with the S3 URL after successful upload
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error in S3 upload controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET request to read a file from S3
s3Controller.get('/read/:fileName', async (req: Request, res: Response) => {
  try {
    // Extract the fileName parameter from the request path
    const { fileName } = req.params;

    // Example JSON body for reading: { "file": { "test": "test" }, "key": "test.txt" }
    const fileContent = await readFileFromS3(fileName);

    // Respond with the content of the file
    res.json(fileContent);
  } catch (error) {
    console.error('Error in S3 read controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default s3Controller;
