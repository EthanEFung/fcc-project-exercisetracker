const express = require('express')
const app = express()
const cors = require('cors')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const compose = require('lodash/fp/compose')
const omit = require('lodash/omit')
const map = require('lodash/map')
require('dotenv').config()


/***********
 * SCHEMAS *
 ***********/

const UserSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  username: {
    type: String,
    required: true,
    unique: true,
  },
})

const ExerciseSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  date: Date,
})


/**********
 * MODELS *
 **********/

const User = new mongoose.model('User', UserSchema)

const Exercise = new mongoose.model('Exercise', ExerciseSchema)


/*********
 * UTILS *
 *********/

const errorHandler = (res) => (err) => res.status(500).json({ error: err.message });
const jsonHandler = (res) => (data) => res.json(data)
const append = b => a => a + b;
const date = (val) => val ? new Date(val) : new Date(Date.now());
const dateStr = (date) => date.toDateString();
const addDate = compose(dateStr, date)


/******************
 * ROUTE HANDLERS *
 ******************/

const rootHandler = (req, res) => res.sendFile(__dirname + '/views/index.html');

const createUserHandler = (req, res) => User.findOneAndUpdate(
  { username: req.body.username }, {}, { new: true, upsert: true }
)
  .then(({ _id, username }) => res.json({ _id, username }))
  .catch(errorHandler(res));

const usersHandler = (req, res) => User.find()
  .then((docs) => res.json(map(docs, ({ _id, username }) => ({ _id, username }))))
  .catch(errorHandler(res));

const createExerciseHandler = (req, res) => new Exercise({
    _id: new mongoose.Types.ObjectId(),
    user: req.params._id,
    description: req.body.description,
    duration: req.body.duration,
    date: date(req.body.date)
  })
  .save()
  .then(({ user: { username }, _id, description, duration, date }) => 
    res.json({ username, _id, description, duration, date: date.toDateString() })
  )
  .catch(errorHandler(res))

const exercisesHandler = (req, res) =>
  Exercise.find({ user: req.params._id })
    .populate('user', 'username')
    .then((docs) =>
      res.json(map(
        docs,
        ({ user: { username }, description, duration, date }) => 
          ({ username, description, duration, date: date.toDateString() })
      )))
    .catch(errorHandler(res))

const logsHandler = (req, res) => {
  // { from, to, limit } = req.query
  const conditions = {
    user: req.params._id,
  }
  if (req.query.to) {
    conditions.date = {
      $lte: req.query.to
    }
  }
  if (req.query.from) {
    conditions.date = {
      ...conditions.date,
      $gte: req.query.from
    }
  }

  Exercise.find(conditions)
    .limit(req.query.limit)
    .populate('user', 'username')
    .then((docs) => {
      const first = docs.find((doc) => !!doc.user.username)
      if (!first) {
        res.send({
          _id: req.params._id,
          username: null,
          log: docs,
        })
        return
      }

      const log = docs.map(doc => {
        return {
          description: doc.description,
          duration: doc.duration,
          date: doc.date.toDateString()
        }
      }) 
      res.send({
        _id: req.params._id,
        username: first.user.username,
        count: docs.length || 0,
        log
      })
    })
    .catch(errorHandler(res))
}


/**************
 * OPERATIONS *
 **************/

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('connected to mongodb'))
  .catch((err) => console.error('unable to connect to mongodb'))

app.use(cors());
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: false }))
app.get('/', rootHandler) 
app.post('/api/users', createUserHandler)
app.get('/api/users', usersHandler)
app.post('/api/users/:_id/exercises', createExerciseHandler)
app.get('/api/users/:_id/exercises', exercisesHandler)
app.get('/api/users/:_id/logs', logsHandler)

const server = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + server.address().port)
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  mongoose.connection.close()
    .then(() => console.log('closed mongodb connection'))
    .catch((err) => console.error('failed to close default mongo connection'))
    .finally(() => server.close(() => console.log('HTTP server closed'))) 
})

