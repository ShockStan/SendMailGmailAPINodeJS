const fs = require('fs').promises;
const path= require('path')
const process = require('process')
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis')

const SCOPES = ['https://mail.google.com/']; 

const TOKEN_PATH = path.join(process.cwd(), 'token.json'); //a token.json file is created if the app is not authorised, and after first time authorisation tokens are used from token.json
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json'); //credentials downloaded from google.cloud console are stored as credentials.json

const saveCredential = async(user)=>{ //method to create token.json file which will store credentials for authorisation
    const credentialsJSON = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(credentialsJSON);
    const key = keys.installed;
    const payLoad = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: user.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payLoad);
}

const loadCredentials = async()=>{ //method to load stored credentials from token.json
    try{
        const token = await fs.readFile(TOKEN_PATH)
        const credentials = JSON.parse(token)
        return google.auth.fromJSON(credentials)
    }catch(err){return null;}
}

const authorize = async ()=>{ //method to authorise gmail sign in
    let user = await loadCredentials();
    if(user){return user;}
    user = await authenticate({
        scopes: SCOPES, keyfilePath: CREDENTIALS_PATH,
    })
    if(user.credentials){
        await saveCredential(user);
    }
    return user;
}

const findToAddress = async(str)=>{ //method to find the mail id to which reply has to be found. the initial id is in form <random@mail.com>
    const a = str.indexOf('<');
    const b = str.indexOf('>');
    return str.substring(a+1,b);
}

const ReplyMessage = 'This is an automated Reply. I am on Vacation. Will reply when I get back to Work. Cheers!!!'; //reply msg to be sent
const LABELName = 'AutomatedReplies'; //label name 

const main = async ()=>{ //main method
    const auth = await authorize(); //authorisation
    const emailList = await ListEmailIds(auth); //list of ids and threadIds of all mails are found
    const idList = emailList.map(a=>a.id); //ids are separeated from threadIds
    const allEmails = await getAllEmails(auth, idList); //emails in inbox and sent are got as an array
    const threadIDofSentMails = allEmails[1].map(a=>a.data.threadId); //threadId of all mails in SENT are got as an array
    for(let i=0;i<allEmails[0].length;i++){ //for loop to find mails which havent still got replies
        let thread_id = allEmails[0][i].data.threadId; //threadId of mail is found
        let mail_id = allEmails[0][i].data.id; //id of mail is found
        if(!threadIDofSentMails.includes(thread_id)){ //whether threadId is found in SENT mails threadIds array or not is found
            let ToAddress = await findToAddress(allEmails[0][i].data.payload.headers.filter(p=>p.name==='From')[0].value); //if not, to mail address is found
            const ReplySent = await sendReply(auth, ReplyMessage, ToAddress, thread_id); //reply is sent
            threadIDofSentMails.push(thread_id); //the thread id is addes list of thread id for which reply is sent
            const Label = await modifyLabels(auth, mail_id, LABELName); //the label is attached the mail from inbox
        }
    }
}

setInterval(()=>{main()},90000); //program to set to run at intervak of 1 and half min

//userId: 'me' ---> means that the process is done for my own email id with which i have authorised

const ListEmailIds = async (auth)=>{ //method to get list of email ids
    const gmail = google.gmail({version: 'v1', auth}); 
    const response = await gmail.users.messages.list({ //users.messages.list 
        userId: 'me',
    })
    const label = response.data;
    return label.messages;
}

const getAllEmails = async (auth, idArray)=>{ //method to find all emails in INBOX & SENT and return as array
    const gmail = google.gmail({version: 'v1', auth});
    const array = []
    for(let i=0;i<idArray.length;i++){
        const response = await gmail.users.messages.get({ //users.messages.get
            userId: 'me',
            id: idArray[i],
        })
        array.push(response)
    }
    const mailsInInbox = [...array.filter(a=>a.data.labelIds.includes('INBOX'))];//emails with INBOX in labelIds
    const mailsInSent = [...array.filter(a=>a.data.labelIds.includes('SENT'))];//emails with SENT in labelIds
    const returnArray = [];
    returnArray.push(mailsInInbox, mailsInSent);//INBOX is kept at 0th index and SENT is kept at 1st index
    return returnArray;
}

const sendReply = async (auth, mailBody, mailTo, threadID)=>{ //method to send reply mail
    const gmail = google.gmail({version:'v1',auth});
    const message = [`To:${mailTo}`,'Subject:AutomaticReply','Content-Type: text/plain; charset=utf-8','',mailBody];
    const rawEmail = Buffer.from(message.join('\n').trim()).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); //email is converted to baseb4 and '+'&'/' are replaced with '-'&'_' respectively. '==' at start & end are replaced with nothing
    const response = await gmail.users.messages.send({ //users.messages.send
        userId: 'me',
        requestBody:{
            raw: rawEmail, //email contents
            threadId: threadID //id of thread to which the reply is to be sent
        }
    });
    const date = new Date();//date for logging purpose
    console.log(`Automated reply sent to ${mailTo} at ${date}`);//after mail is sent, a success log is created
}

const checkLabelExist = async(auth, labelName) =>{ //method to check if the label to which Mail is to attached exist
    const gmail = google.gmail({version: 'v1', auth});
    const response = await gmail.users.labels.list({ //users.labels.list
        userId: 'me',
    })
    const labels = response.data.labels;
    const labelExist = labels.find(a=>a.name===labelName); 
    if(labelExist){//if label with specified name exist, label id is returned
        return labelExist.id;
    }
    return false; //else false
}

const createLabel = async(auth, labelName)=>{ //method to create label id=f it doesnt exist
    const gmail = google.gmail({version: 'v1', auth});
    const response = gmail.users.labels.create({ //users.labels.create
        userId: 'me',
        requestBody:{
            name: labelName,//label name
        }
    });
    return response;
}

const modifyLabels =async(auth, mailID, labelName)=>{ //method to modify label of mail with given id
    const gmail = google.gmail({version: 'v1', auth});
    let labelID = await checkLabelExist(auth, labelName); //whether the label exists or not, is checked
    if(!labelID){
        const creatingLabel = await createLabel(auth, labelName); //if not a new label is created
        labelID = creatingLabel.data.id;//label id
    }
    const response = await gmail.users.messages.modify({ //users.messages.modify
        userId:'me',
        id:mailID,
        requestBody:{
            addLabelIds: labelID,//labelId is added to array of label ids
        }
    });
    console.log(`The mail with id ${mailID} is attached with label ${labelName}`); //success is logged
    return response;
}