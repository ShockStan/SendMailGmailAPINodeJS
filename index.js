const fs = require('fs').promises;
const path= require('path')
const process = require('process')
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis')

const SCOPES = ['https://mail.google.com/'];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

const saveCredential = async(user)=>{
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

const loadCredentials = async()=>{
    try{
        const token = await fs.readFile(TOKEN_PATH)
        const credentials = JSON.parse(token)
        return google.auth.fromJSON(credentials)
    }catch(err){return null;}
}

const authorize = async ()=>{
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

const findToAddress = async(str)=>{
    const a = str.indexOf('<');
    const b = str.indexOf('>');
    return str.substring(a+1,b);
}

const ReplyMessage = 'This is an automated Reply. I am on Vacation. Will reply when I get back to Work. Cheers!!!';
const LABELName = 'AutomatedReplies';

const main = async ()=>{
    const auth = await authorize();
    const emailList = await ListEmailIds(auth);
    const idList = emailList.map(a=>a.id);
    const allEmails = await getAllEmails(auth, idList);
    const threadIDofSentMails = allEmails[1].map(a=>a.data.threadId);
    for(let i=0;i<allEmails[0].length;i++){
        let thread_id = allEmails[0][i].data.threadId;
        let mail_id = allEmails[0][i].data.id;
        if(!threadIDofSentMails.includes(thread_id)){
            let ToAddress = await findToAddress(allEmails[0][i].data.payload.headers.filter(p=>p.name==='From')[0].value);
            const ReplySent = await sendReply(auth, ReplyMessage, ToAddress, thread_id);
            threadIDofSentMails.push(thread_id);
            const Label = await modifyLabels(auth, mail_id, LABELName);
        }
    }
}

setInterval(()=>{main()},60000);

const ListEmailIds = async (auth)=>{
    const gmail = google.gmail({version: 'v1', auth});
    const response = await gmail.users.messages.list({
        userId: 'me',
    })
    const label = response.data;
    return label.messages;
}

const getAllEmails = async (auth, idArray)=>{
    const gmail = google.gmail({version: 'v1', auth});
    const array = []
    for(let i=0;i<idArray.length;i++){
        const response = await gmail.users.messages.get({
            userId: 'me',
            id: idArray[i],
        })
        array.push(response)
    }
    const mailsInInbox = [...array.filter(a=>a.data.labelIds.includes('INBOX'))];
    const mailsInSent = [...array.filter(a=>a.data.labelIds.includes('SENT'))];
    const returnArray = [];
    returnArray.push(mailsInInbox, mailsInSent);
    return returnArray;
}

const sendReply = async (auth, mailBody, mailTo, threadID)=>{
    const gmail = google.gmail({version:'v1',auth});
    const message = [`To:${mailTo}`,'Subject:AutomaticRepl','Content-Type: text/plain; charset=utf-8','',mailBody];
    const rawEmail = Buffer.from(message.join('\n').trim()).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody:{
            raw: rawEmail,
            threadId: threadID
        }
    });
    const date = new Date();
    console.log(`Automated reply sent to ${mailTo} at ${date}`);
}

const checkLabelExist = async(auth, labelName) =>{
    const gmail = google.gmail({version: 'v1', auth});
    const response = await gmail.users.labels.list({
        userId: 'me',
    })
    const labels = response.data.labels;
    const labelExist = labels.find(a=>a.name===labelName);
    if(labelExist){
        return labelExist.id;
    }
    return false;
}

const createLabel = async(auth, labelName)=>{
    const gmail = google.gmail({version: 'v1', auth});
    const response = gmail.users.labels.create({
        userId: 'me',
        requestBody:{
            name: labelName,
        }
    });
    return response;
}

const modifyLabels =async(auth, mailID, labelName)=>{
    const gmail = google.gmail({version: 'v1', auth});
    let labelID = await checkLabelExist(auth, labelName);
    if(!labelID){
        const creatingLabel = await createLabel(auth, labelName);
        labelID = creatingLabel.data.id;
    }
    const response = await gmail.users.messages.modify({
        userId:'me',
        id:mailID,
        requestBody:{
            addLabelIds: labelID,
        }
    });
    console.log(`The mail with id ${mailID} is attached with label ${labelName}`);
    return response;
}