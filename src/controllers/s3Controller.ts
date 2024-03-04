// src/controllers/s3Controller.ts
import express, { Router, Request, Response } from 'express';
import { s3service } from '../services/s3service';

const s3Controller: Router = express.Router();

// POST request to upload a file to S3
s3Controller.post('/upload', async (req: Request, res: Response) => {
  try {
    // Example JSON body for uploading: { "file_content": { "test": "test" }, "file_name": "test.txt" }
    // const Test_Session = req.body.Test_Session;
    // const Student_ID = req.body.Student_ID
    // Destructure and create a new object with only the desired properties
    const { Test_Session, Student_ID, Name, Surname, ...Data } = req.body;
    // Assuming "file_content" is a JSON object and "file_name" is a string
    const url = await s3service.uploadToS3(Test_Session, Student_ID, Name, Surname, Data);

    // Respond with the S3 URL after successful upload
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error in S3 upload controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET request to read a file from S3
s3Controller.get('/read/:Test_Session/:Student_ID?', async (req: Request, res: Response) => {
  try {
    // Extract the fileName parameter from the request path
    const { Test_Session, Student_ID } = req.params;
    let fileContent;

    if( Student_ID !== undefined && Student_ID !== '' ){
      fileContent = await s3service.getAllActivityByTestSessionAndStudentID(Test_Session, Student_ID);
    }else{
      fileContent = await s3service.getAllActivityByTestSession(Test_Session);
    }

    if (fileContent === undefined || Array.isArray(fileContent) && fileContent.length === 0) res.status(404).json({ success: false, error: 'File not found' });
    else res.json(fileContent);
    
  } catch (error) {
    console.error('Error in S3 read controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default s3Controller;
