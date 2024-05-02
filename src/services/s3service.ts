// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { float } from 'aws-sdk/clients/cloudfront';

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
  DifferentIP = 'DifferentIP',
  Screen_Activity = 'Screen_Activity',
  Short_Interval_between_Answers = 'Short_Interval_between_Answers',
  Rapid_Response_Submission = 'Rapid_Response_Submission',
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

const uploadSuggestion = async(Test_Session: string, Suggest: SuggestEntry) : Promise<any> => {
  try{
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/suggestions/`,
  };
  const data = await s3.listObjectsV2(params).promise();
  return await uploadToS3(`${Test_Session}/suggestions/suggest_${(data.KeyCount || 0) + 1}`, Suggest)

  } catch (error) {
    console.log(error)
    throw error;
  }
}

const cleanSuggestions = async (Test_Session: string): Promise<void> => {
  try {
    const params: AWS.S3.Types.ListObjectsV2Request = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Prefix: `${Test_Session}/suggestions/`,
    };
    const data = await s3.listObjectsV2(params).promise();
    
    if (data.Contents && data.Contents.length > 0) {
      const objectsToDelete = data.Contents.map(obj => ({ Key: obj.Key }));
      
      const deleteParams: AWS.S3.Types.DeleteObjectsRequest = {
        Bucket: process.env.BUCKET_NAME ?? '',
        Delete: {
          Objects: objectsToDelete,
        },
      };
      
      await s3.deleteObjects(deleteParams).promise();
    }
    
    // console.log(`Suggestion data for Test_Session ${Test_Session} cleaned successfully.`);
  } catch (error) {
    console.error('Error cleaning suggestion data:', error);
    throw error;
  }
};

// ------------------------ Suggest Function ------------------------ //
const checkDifferent_IP = (Log: LogEntry) :void => {
  // Process Analyze
  const uniqueIPs: Set<string> = new Set();
  Log.Activities.forEach((activity) => {
    const ip = activity.IP;
    if (ip && ip !== 'N/A') {
      uniqueIPs.add(ip);
    }
  });
  
  // Check Fore Different IPs
  if(uniqueIPs.size > 1) {
    let suggestion: SuggestEntry = {
      // Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.DifferentIP,
      Description: `Student have ${uniqueIPs.size} IPs`,
    };
    uploadSuggestion(Log.Test_Session, suggestion)
  }
}

const checkScreen_Activity = (Log: LogEntry) :void => {
  // Process Analyze
  const InActivePeriods : number[] = []
  let When_InActive: number = -1; // Initialize to a default value
  Log.Activities.forEach((activity) => {
    if( activity.Status  == 'Inactive Tab') {
      When_InActive = Date.parse(activity.Timestamp);
    }
    if (activity.Status === 'Active Tab') {
      if (When_InActive !== -1) { // Check if When_InActive is not the default value
        const DifferentTime: number = parseFloat(((Date.parse(activity.Timestamp) - When_InActive) / 1000).toFixed(2));
        InActivePeriods.push(DifferentTime);
        When_InActive = -1; // Reset When_InActive to the default value
      }
    }
  });

  // Check For Screen Activity
  if(InActivePeriods.length >= 1) {
    let suggestion: SuggestEntry = {
      // Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.DifferentIP,
      Description: `Student experienced ${InActivePeriods.length} periods of inactivity with durations: ${InActivePeriods.join(', ')} seconds`,

    };
    uploadSuggestion(Log.Test_Session, suggestion)
  }
}

const checkShort_Interval_between_Answers = (Log: LogEntry): void => {
  const submissionTimestamps: number[] = [];
  const SHORT_INTERVAL_THRESHOLD: number = 10000; // 10 seconds threshold for short interval
  const relevantStatuses = ['Submit', 'Finish Button', 'Save and Close']; // Relevant statuses for submissions

  Log.Activities.forEach((activity) => {
    if (relevantStatuses.some((status) => activity.Status.includes(status))) {
      const timestamp = Date.parse(activity.Timestamp);
      submissionTimestamps.push(timestamp);
    }
  });

  // Check for short intervals between submissions
  for (let i = 0; i < submissionTimestamps.length - 1; i++) {
    const interval = submissionTimestamps[i + 1] - submissionTimestamps[i];
    if (interval < SHORT_INTERVAL_THRESHOLD) {
      const suggestion: SuggestEntry = {
        Student_ID: Log.Student_ID,
        Name: Log.Name,
        Type: SuggestType.Short_Interval_between_Answers,
        Description: `Short interval between consecutive answers detected (${interval} milliseconds).`,
      };
      uploadSuggestion(Log.Test_Session, suggestion);
    }
  }
};

const checkRapid_Response_Submission = (Log: LogEntry): void => {
  let response_submission, starttime: number;
  let RAPID_RESPONSE_THRESHOLD: number = 30 * 60 * 1000; // 30 minutes threshold in milliseconds

  Log.Activities.forEach((activity) => {
    if (activity.Status === 'Start test from cover page' || activity.Status === 'Test submission confirm') {
      starttime = Date.parse(activity.Timestamp);
    } else if (activity.Status === 'Test submission confirm') {
      response_submission = Date.parse(activity.Timestamp) - starttime
    }
  });

  // Check for rapid response submission
  if (response_submission && response_submission > RAPID_RESPONSE_THRESHOLD) {
    const suggestion: SuggestEntry = {
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Rapid_Response_Submission,
      Description: `Rapid response submission detected (${(response_submission / (1000 * 60)).toFixed(2)} minutes). Which is greater than ${(RAPID_RESPONSE_THRESHOLD / (1000 * 60)).toFixed(2)} minutes.`,
    };
    uploadSuggestion(Log.Test_Session, suggestion);
  }
};


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
    // Clean suggestion data for the test session
    await cleanSuggestions(Test_Session);

    // Retrieve all activity logs for the given test session
    const activityLogs = await getActivitiesByTestSession(Test_Session);
    
    // Check if activityLogs is undefined
    if (!activityLogs) {
      throw 'Activity logs not found.'
    }

    activityLogs.forEach((activityLog)=> {
      // Sort activities by Timestamp
      activityLog.Activities.sort((a, b) => {
        return Date.parse(a.Timestamp) - Date.parse(b.Timestamp);
      });

      try {
        // Analyze forensic for each activity log
        checkDifferent_IP(activityLog);
      } catch (error) {
        console.error('Error in checkDifferent_IP:', error);
        // Handle error or continue to the next log
      }

      try {
        checkScreen_Activity(activityLog);
      } catch (error) {
        console.error('Error in checkScreen_Activity:', error);
        // Handle error or continue to the next log
      }

      try {
        checkShort_Interval_between_Answers(activityLog);
      } catch (error) {
        console.error('Error in checkShort_Interval_between_Answers:', error);
        // Handle error or continue to the next log
      }

      try {
        checkRapid_Response_Submission(activityLog);
      } catch (error) {
        console.error('Error in checkRapid_Response_Submission:', error);
        // Handle error or continue to the next log
      }
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