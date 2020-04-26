require('dotenv').config()
const crypto = require('crypto')
const fetch = require('node-fetch')
const xmlparser = require('fast-xml-parser')
const querystring = require('querystring')
const slugify = require('slugify')
const express = require('express')
const app = express()
const port = process.env.PORT || 5001
const host = process.env.HOST || '0.0.0.0'

const BBB_API_URL = process.env.BBB_API_URL
const BBB_API_SECRET = process.env.BBB_API_SECRET
const WELCOME_MESSAGE = process.env.WELCOME_MESSAGE
const NOPW_WELCOME_MESSAGE = process.env.NOPW_WELCOME_MESSAGE
const MOD_WELCOME_MESSAGE = process.env.MOD_WELCOME_MESSAGE

// TODO: internationalize more
slugify.extend({'ä': 'ae', 'ü': 'ue', 'ö': 'oe', 'ß': 'ss'})

const sha1 = function (data) {
  return crypto.createHash("sha1").update(data, "binary").digest("hex")
}

const checksum = function (method, query) {
  return sha1(method + query + BBB_API_SECRET)
}

const buildApiUrl = function (method, params) {
  var url = BBB_API_URL + (BBB_API_URL.charAt(BBB_API_URL.length - 1) === '/' ? '' : '/') + 'api/' + method
  var query = querystring.stringify(params).replace(/'/g, '%27')
  var cs = checksum(method, query)
  params['checksum'] = cs
  return url + '?' + querystring.stringify(params).replace(/'/g, '%27')
}

const callApi = async function (method, params) {
  return fetch(buildApiUrl(method, params)).then(res => res.text()).then(data => xmlparser.parse(data).response)
}

const createMeeting = async function (name, id, options) {
  var params = { meetingID: id, name: name, ...options }
  return await callApi('create', params)
}

const getMeetingInfo = async function (id) {
  var params = { meetingID: id }
  return await callApi('getMeetingInfo', params)
}

const joinMeeting = async function (id, name, password) {
  var params = { meetingID: id, fullName: name, password: password, redirect: false };
  return await callApi('join', params);
}

const joinMeetingUrl = function (id, name, password) {
  var params = { meetingID: id, fullName: name, password: password, redirect: true };
  return buildApiUrl('join', params);
}

const generateRandomPassword = function () {
  const alpha = 'qwertyuiopasdfghjklzxcvbnm';
  var password = '';
  for (let i=0;i<24;i++) {
    password += alpha[Math.floor(Math.random() * alpha.length)]
  }
  return password;
}

app.use(express.static('public'))
app.set('view engine', 'ejs')
app.set('trust proxy', 'loopback')
app.use(express.urlencoded({ extended: true }))

app.get('/', function(req, res) {
  res.redirect('/easy');
})

app.get('/easy', function (req, res) {
  res.render('index', {
    roomName: req.query.roomName,
    roomBlocked: req.query.roomBlocked,
    roomMissing: req.query.roomMissing })
})


// create a room (optionally with password)
// if password is set provide mod and user pw for welcome message
app.post('/easy', async function (req, res) {
  var roomName = req.body.room
  //easy-prefix is used to mark the room as created by this frontend
  var room = "easy-" + slugify(roomName, { lower: true })

  // if user provides password within room creation, set prefix "user-"  otherwise set it to "auto-"
  var room_password;
  var custom_password = req.body.room_password;
  if (custom_password) {
      // generate random moderator password to give possibility to provide it in welcome message
    var moderator_password = generateRandomPassword();
    room_password = "user-" + custom_password;
    // add passwords to options for room creation
    var options = { 'attendeePW' : room_password, 'moderatorPW' : moderator_password }
  }else {
    // create random password with "auto-" prefix. Not entirely necessary, but theoretically random password
    // could start with "user-" and might therefore accidentally be interpreted as manual pw
    room_password = "auto-" + generateRandomPassword();
    var options = { 'attendeePW' : room_password }
  }

  //set welcome message(s)
  if (typeof WELCOME_MESSAGE === 'string') {
    var url = req.protocol + '://' + req.get('host') + '/easy/' + roomName
    var joinpattern = new RegExp('%%JOINURL%%', 'g')
    //if the room has a manual password set we will provide two welcome msgs and only inform moderators about joining options and passwords
    if (room_password.startsWith('user-')) {
      var mpasswd = new RegExp('%%MPASSWD%%', 'g')
      var upasswd = new RegExp('%%UPASSWD%%', 'g')
      var modwelcome = MOD_WELCOME_MESSAGE.replace(joinpattern, url)
      modwelcome = modwelcome.replace(mpasswd, moderator_password)
      options.moderatorOnlyMessage = modwelcome.replace(upasswd, custom_password)
      options.welcome = WELCOME_MESSAGE
    } else {
      // welcome message with no manual pw gets joinurl
      options.welcome = NOPW_WELCOME_MESSAGE.replace(joinpattern, url)
    }
  }

  var meet = await createMeeting(roomName, room, options)
    //check if roomcreation was not succesful
  if (meet.returncode === 'FAILED') {
      //if room exists put warning message on page - else just go back
    if (meet.messageKey === 'idNotUnique') {
      // timeout as a very basic bruteforce prevention to prevent room search
      setTimeout(function (){
        res.redirect('/easy' + `?roomName=${encodeURIComponent(roomName)}&roomBlocked=true`);
      }, 1000);
      return
    } else {
      res.redirect('/easy');
      return
    }
  }

  //slugify roomName because room contains prefix
  res.redirect('/easy/' + slugify(roomName, { lower: true }))
})

app.get('/easy/:room', async function (req, res){
  // added slugify lower to prevent error if accidental uppercase or special characters are in adress
  //easy-prefix is used to only handle rooms created by this frontend
  var room = "easy-" + slugify(req.params.room, { lower: true })
  var info = await getMeetingInfo(room)

  //check if meeting info was not succesfully grabbed and in case redirect with error message (room not created)
  if (info.returncode === 'FAILED') {
      // timeout as a very basic bruteforce prevention to prevent room search
      setTimeout(function (){
        res.redirect('/easy' + `?roomName=${encodeURIComponent(req.params.room)}&roomMissing=true`)
      }, 1000);
    return
  }

  // This variable decides whether we display a password dialogue.
  // Normally, meetings require no user provided password...
  var requiresPassword = false;
  // ... unless one is set
  if (info.attendeePW.startsWith('user-')) {
    requiresPassword = true;
  }
  // ... except when the room is empty, then we'll become the moderator anyway.
  if (info.hasUserJoined == false || info.participantCount == 0) {
    requiresPassword = false;
  }

  res.render('join', {
    room: room,
    info: info,
    requiresPassword: requiresPassword,
    username: req.query.username,
    wrongPw: req.query.wrongPw })
})

app.post('/easy/:room', async function (req, res) {
  var room = slugify(req.params.room)
  var name = req.body.name
  var info = await getMeetingInfo(room)
  if (info.returncode === 'FAILED') {
    res.redirect('/easy')
    return
  }

  var password = info.attendeePW
  // check if there is anybody in the meeting - if not give moderator rights
  if (info.hasUserJoined == false || info.participantCount == 0) {
    password = info.moderatorPW
  // if there is somebody in the meeting get the attendee pw and check if it is manually set (starts wit user-) otherwise just join as attende
  } else {
    password = info.attendeePW;
    if (password.startsWith('user-')) {
      // check if provided login password matches required password if not redirect to login page with error
      if (password != "user-" + req.body.room_password) {
        password = info.moderatorPW;
        if (password != req.body.room_password) {
          // timeout as a very basic bruteforce prevention - double time for password try (2 seconds)
          setTimeout(function (){
            res.redirect('/easy/' + info.meetingName + `?username=${encodeURIComponent(name)}&wrongPw=true`);
          }, 2000);
          return;
        }
      }
    }
  }
  res.redirect(joinMeetingUrl(room, name, password))
})

app.listen(port, host, () => console.log(`Running on ${host}:${port}`))

