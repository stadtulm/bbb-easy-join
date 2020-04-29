require('dotenv').config()
const crypto = require('crypto')
const fetch = require('node-fetch')
const xmlparser = require('fast-xml-parser')
const querystring = require('querystring')
const slugify = require('slugify')
const urljoin = require('url-join')
const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const host = process.env.HOST || '0.0.0.0'

const BBB_API_URL = process.env.BBB_API_URL
const BBB_API_SECRET = process.env.BBB_API_SECRET
const WELCOME_MESSAGE = process.env.WELCOME_MESSAGE

const ROOT_PATH = '/b/'

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

app.locals.ROOT_PATH = ROOT_PATH;

app.use(ROOT_PATH, express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.set('trust proxy', 'loopback')
app.use(express.urlencoded({ extended: true }))

app.get('/', function(req, res) {
  res.redirect(ROOT_PATH);
})

app.get(ROOT_PATH, function (req, res) {
  res.render('index')
})

app.post(ROOT_PATH, async function (req, res) {
  var roomName = req.body.room
  var room = slugify(roomName, { lower: true })
  var options = {}

  if (typeof WELCOME_MESSAGE === 'string') {
    var url = urljoin(req.protocol + '://' + req.get('host'), ROOT_PATH, room)
    var joinpattern = new RegExp('%%JOINURL%%', 'g')
    options.welcome = WELCOME_MESSAGE.replace(joinpattern, url)
  }

  var meet = await createMeeting(roomName, room, options)
  if (meet.returncode === 'FAILED' && meet.messageKey !== 'idNotUnique') {
    res.redirect(ROOT_PATH)
    return
  }

  res.redirect(urljoin(ROOT_PATH, room))
})

app.get(urljoin(ROOT_PATH, ':room'), async function (req, res){
  var room = slugify(req.params.room)

  var info = await getMeetingInfo(room)
  if (info.returncode === 'FAILED') {
    res.redirect(ROOT_PATH)
    return
  }

  res.render('join', { room: room, info: info })
})

app.post(urljoin(ROOT_PATH, ':room'), async function (req, res) {
  var room = slugify(req.params.room)
  var name = req.body.name
  var info = await getMeetingInfo(room)
  if (info.returncode === 'FAILED') {
    res.redirect(ROOT_PATH)
    return
  }

  var password = info.attendeePW
  if (info.hasUserJoined == false || info.participantCount == 0) {
    password = info.moderatorPW
  }

  res.redirect(joinMeetingUrl(room, name, password))
})

app.listen(port, host, () => console.log(`Running on ${host}:${port}. root path: ${ROOT_PATH}`))

