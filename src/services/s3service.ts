// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

interface Activity {
  Status: string;
  Timestamp: string;
  IP: string; // Assuming IP is a string
}

interface LogEntry {
  Test_Session?: string;
  Student_ID: string;
  Name: string;
  Activities: Activity[];
}

enum SuggestType {
  DifferentIP,
  Screen_Activity,
  Short_Interval_between_Answers,
  Rapid_Response_Submission,
}

interface SuggestEntry {
  Test_Session?: string;
  Student_ID: string;
  Name: string;
  Type: SuggestType,
  Description: string,
}

// ------------------------ Private Function ------------------------ //
const uploadToS3 = async( Key: string, LogData: any ) :Promise<any> => {
  try {
    const params: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: Key,
      Body: Readable.from(JSON.stringify(LogData)),
    };

    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    throw error;
  }
}

const getDataFromS3 = async(Key: string) :Promise<any> => {
  try {
    const params: S3.Types.GetObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: Key,
    };

    const data = await s3.getObject(params).promise();

    return data;
  } catch(error) {
    throw error;
  }
}

const uploadSuggestions = async(Test_Session: string, Suggest: SuggestEntry) : Promise<any> => {
  try{
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/suggestions/`,
  };
  const data = await s3.listObjectsV2(params).promise();
  return await uploadToS3(`${Test_Session}/suggestions/suggest_${(data.KeyCount || 0) + 1}`, Suggest)

} catch (error) {
  throw error;
}
}
// ------------------------ Suggest Function ------------------------ //
const checkDifferent_IP = (Log: LogEntry) :SuggestEntry | null => {
  const uniqueIPs: Set<string> = new Set();
  Log.Activities.forEach((activity) => {
    const ip = activity.IP;
    if (ip && ip !== 'N/A') {
      uniqueIPs.add(ip);
    }
  });
  
  if(uniqueIPs.size > 1) {
    let suggestions: SuggestEntry = {
      // Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.DifferentIP,
      Description: `Student have ${uniqueIPs.size} IPs`,
    };
    return suggestions; //Detect forensic
  }
  return null;
}

const checkScreen_Activity = (Log: LogEntry) :SuggestEntry | null => {
// Example of Log
// {
//   "Name": "John Doe",
//   "Activities": [
//       {
//           "Status": "Submit from password required",
//           "Timestamp": "4/30/2024, 11:32 AM",
//           "IP": "10.203.176.177"
//       }
//   ],
//   "Test_Session": "cef28a1f-166d-4b81-b2f0-8e7fd2af7b07",
//   "Student_ID": "1"
// }
  return null;
}

const checkShort_Interval_between_Answers = (Log: LogEntry) :SuggestEntry | null => {
// Example of Log
// {
//   "Name": "John Doe",
//   "Activities": [
//       {
//           "Status": "Submit from password required",
//           "Timestamp": "4/30/2024, 11:32 AM",
//           "IP": "10.203.176.177"
//       }
//   ],
//   "Test_Session": "cef28a1f-166d-4b81-b2f0-8e7fd2af7b07",
//   "Student_ID": "1"
// }
  return null;
}

const checkRapid_Response_Submission = (Log: LogEntry) :SuggestEntry | null => {
// Example of Log
// {
//   "Name": "John Doe",
//   "Activities": [
//       {
//           "Status": "Submit from password required",
//           "Timestamp": "4/30/2024, 11:32 AM",
//           "IP": "10.203.176.177"
//       }
//   ],
//   "Test_Session": "cef28a1f-166d-4b81-b2f0-8e7fd2af7b07",
//   "Student_ID": "1"
// }
  return null;
}

// ------------------------ Public Function ------------------------ //
const uploadActivity = async (
  Test_Session: string,
  Student_ID: string,
  Name: string,
  // Surname: string,
  log: Activity,
  // IP: string | undefined | null,
): Promise<string> => {
  try {
    // Attempt to read the file from S3
    let existingLog: LogEntry | undefined;
    try {
      existingLog = await getActivitiesByTestSessionAndStudentID(Test_Session, Student_ID);
    } catch (readError) {
      // Handle the NoSuchKey error or log it if needed
      console.error('Error reading file from S3:', readError);
    }
    // Create a new object by merging log and IP
    // const newActivity = {
    //   ...log,
    //   IP: IP || 'N/A',
    // };
    
    let LogData : LogEntry;

    // If the file exists, update the log list
    // if (existingLog && Array.isArray(existingLog)) {
    if (existingLog) {
      const {Test_Session, Student_ID, ...Data} = existingLog
      LogData = {Student_ID, ...Data}
      LogData.Activities.push(log)

    } else {
      // If the file doesn't exist or has invalid content, create a new list with the new log
      LogData = {
        Student_ID: Student_ID,
        Name: Name,
        Activities: [log],
      };
    }
    
    return await uploadToS3(`${Test_Session}/activities/${Student_ID}`, LogData)
    // const params: S3.Types.PutObjectRequest = {
    //   Bucket: process.env.BUCKET_NAME ?? '',
    //   Key: `${Test_Session}/activities/${Student_ID}`,
    //   Body: Readable.from(JSON.stringify(LogData)),
    // };

    // const data = await s3.upload(params).promise();
    // return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

const getActivitiesByTestSessionAndStudentID = async (
  Test_Session: string,
  Student_ID: string,
): Promise< LogEntry | undefined > => {
  try {

    const data = await getDataFromS3(`${Test_Session}/activities/${Student_ID}`);
    const jsonString = data.Body?.toString('utf-8');

    let response: LogEntry;
    response = JSON.parse(jsonString)
    response.Test_Session = Test_Session
    response.Student_ID = Student_ID
    

    return response;
  } catch (error: any) {
    if (error.code === 'NoSuchKey') {
      console.error('File not found on S3:', error);
      return undefined; // Return undefined when the key is not found
    } else {
      console.error('Error reading file from S3:', error);
      throw error; // Rethrow other errors
    }
  }
};

const getActivitiesByTestSession = async (
  Test_Session: string,
): Promise<LogEntry[]> => {
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/activities/`,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents?.map((object) => object.Key || '') || [];

    // console.log(keys)
    const logEntries: LogEntry[] = [];

    // Loop through each key and retrieve the content
    for (const key of keys) {
      const [,,studentId] = key.split('/'); // Assuming the format is "Test_Session/Student_ID"
      try {
        const logEntry = await getActivitiesByTestSessionAndStudentID(Test_Session, studentId);

        if (logEntry) {
          logEntries.push(logEntry);
        }
      } catch (readError) {
        // Handle errors if needed
        console.error(`Error reading file for key ${key} from S3:`, readError);
      }
    }

    return logEntries;
  } catch (error) {
    console.error('Error listing keys from S3:', error);
    throw error;
  }
};

const getSuggestionsByTestSession = async (
  Test_Session: string,
): Promise<SuggestEntry[]> => {
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/suggestions/`,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents?.map((object) => object.Key || '') || [];

    // console.log(keys)
    const suggestEntries: SuggestEntry[] = [];

    // Loop through each key and retrieve the content
    for (const key of keys) {
      const [,,file_name] = key.split('/'); // Assuming the format is "Test_Session/Student_ID"
      try {
        const data = await getDataFromS3(`${Test_Session}/suggestions/${file_name}`);
        const jsonString = data.Body?.toString('utf-8');
        if (jsonString) {
          suggestEntries.push(JSON.parse(jsonString));
        }
      } catch (readError) {
        // Handle errors if needed
        console.error(`Error reading file for key ${key} from S3:`, readError);
      }
    }

    return suggestEntries;
  } catch (error) {
    console.error('Error listing keys from S3:', error);
    throw error;
  }
};

const analyzeForTestSession = async (Test_Session: string): Promise<any> => {
  try {
    // Retrieve all activity logs for the given test session
    const activityLogs = await getActivitiesByTestSession(Test_Session);
    // Check if activityLogs is undefined
    if (!activityLogs) {
      throw 'Activity logs not found.'
    }

    activityLogs.forEach((activityLog)=> {
      //analyze forensic
      const Different_IP = checkDifferent_IP(activityLog)
      const Screen_Activity = checkScreen_Activity(activityLog)
      const Short_Interval_between_Answers = checkShort_Interval_between_Answers(activityLog)
      const Rapid_Response_Submission = checkRapid_Response_Submission(activityLog)

      //check forensic
      if (Different_IP) uploadSuggestions(Test_Session, Different_IP);
      if (Screen_Activity) uploadSuggestions(Test_Session, Screen_Activity);
      if (Short_Interval_between_Answers) uploadSuggestions(Test_Session, Short_Interval_between_Answers);
      if (Rapid_Response_Submission) uploadSuggestions(Test_Session, Rapid_Response_Submission);

    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const s3service = {
  uploadActivity, 
  getActivitiesByTestSessionAndStudentID,
  getActivitiesByTestSession,
  getSuggestionsByTestSession,
  analyzeForTestSession,
}