// src/controllers/s3Controller.ts
import express, { Router, Request, Response } from 'express';
import { s3service } from '../services/s3service';
import requestIp from 'request-ip';
import ip from 'ip';

function convertIPv6ToIPv4(ip: string): string | null {
  // Check if the address is in the correct format
  if (ip.startsWith('::ffff:')) {
      // Remove the IPv6 prefix
      return ip.substring(7);
  }
  return ip; // ip is IPv4.
}

const s3Controller: Router = express.Router();
s3Controller.use(requestIp.mw()); // Middleware to parse client IP

// POST request to upload a file to S3
s3Controller.post('/upload', async (req: Request, res: Response) => {
  let clientIp: string | undefined | null = req.clientIp; // This is the client's IP address
  // let clientIp: string | undefined | null = req.ip; // This is the client's IP address
  console.log('Client IP =', clientIp);
  // Convert IP from IPv6 to IPv4
  if (clientIp && ip.isV6Format(clientIp)) { 
    clientIp = convertIPv6ToIPv4(clientIp);
  }
  console.log('Client IPv4 =', clientIp);
  
  try {
    // const Test_Session = req.body.Test_Session;
    // const Student_ID = req.body.Student_ID
    // Destructure and create a new object with only the desired properties
    const { Test_Session, Student_ID, Name, ...Data } = req.body;
    Data.IP = clientIp
    // Assuming "file_content" is a JSON object and "file_name" is a string
    const url = await s3service.uploadActivity(Test_Session, Student_ID, Name, Data);

    // Respond with the S3 URL after successful upload
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error in S3 upload controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET request to activities from S3
s3Controller.get('/:Test_Session/activities/:Student_ID?', async (req: Request, res: Response) => {
  try {
    // Extract the fileName parameter from the request path
    const { Test_Session, Student_ID } = req.params;
    let fileContent;

    if( Student_ID !== undefined && Student_ID !== '' ){
      fileContent = await s3service.getActivitiesByTestSessionAndStudentID(Test_Session, Student_ID);
    }else{
      fileContent = await s3service.getActivitiesByTestSession(Test_Session);
    }

    if (fileContent === undefined || Array.isArray(fileContent) && fileContent.length === 0) res.status(404).json({ success: false, error: 'File not found' });
    else res.json(fileContent);
    
  } catch (error) {
    console.error('Error in S3 read controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET request to suggestions from S3
s3Controller.get('/:Test_Session/suggestions', async (req: Request, res: Response) => {
  try {
    // Extract the fileName parameter from the request path
    const { Test_Session } = req.params;
    let fileContent;

    fileContent = await s3service.getSuggestionsByTestSession(Test_Session);
    
    if (fileContent === undefined || Array.isArray(fileContent) && fileContent.length === 0) res.status(404).json({ success: false, error: 'File not found' });
    else res.json(fileContent);
    
  } catch (error) {
    console.error('Error in S3 read controller:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET request to analyze IPs in a test session
s3Controller.get('/:Test_Session/analyze', async (req: Request, res: Response) => {
  try {
    const { Test_Session } = req.params;

    // Retrieve all activity logs for the given test session
    const url = await s3service.analyzeForTestSession(Test_Session);
    
    // Respond with the S3 URL after successful analyze
    return res.json({ success: true, url });
  } catch (error) {
    console.error('Error analyzing :', error);
    if(error == 'Activity logs not found.') res.status(404).json({ success: false, error: error });
    else res.status(500).json({ success: false, error: error });
  }
});

export default s3Controller;
