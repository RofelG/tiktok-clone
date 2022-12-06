'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Import Express
var express = require('express');
var app = express();

// set the view engine to ejs
app.set('view engine', 'ejs');

//Connect Database
// const con = require('./config/mysql');

//Port Declaration
const { API_PORT } = process.env;
const port = process.env.PORT || API_PORT;

//Require Middleware
const auth = require('./middleware/auth');

app.use(cookieParser());

// allow json data to be passed in the body of requests
app.use(express.json());

app.use('/static', express.static('public'));

app.post('/api/register', async (req, res) => {
  try {
    // Get user input
    const { user_first, user_last, user_email, user_password } = req.body;

    // Validate user input
    if (!(user_email && user_password && user_first && user_last)) {
      res.status(400).json({error:"All input is required"});
    }

    // Validate if user exist in our database
    let oldUser = await con.getUser(user_email);

    if (oldUser != undefined) {
      return res.status(409).json({error:"User Already Exist. Please Login"});
    }

    let salt = crypto.randomBytes(32).toString('hex');
    //Encrypt user password
    let encryptedPassword = await bcrypt.hash(user_password + salt, 10);

    let user = await con.createUser([user_first, user_last, user_email, encryptedPassword, salt]);

    // Create token
    const token = jwt.sign(
      { user_id: user, user_email },
        process.env.TOKEN_KEY,
      {
        expiresIn: "2h",
      }
    );
    // save user token
    let output = {
      user_id: user,
      user_first: user_first,
      user_last: user_last,
      user_email: user_email,
      token: token
    };

    // return new user
    res.status(201).json(output);
  } catch (err) {
    console.log(err);
  }
});

app.post("/api/login", async (req, res) => {
  try {
    // Get user input
    const { user_email, user_password } = req.body;

    // Validate user input
    if (!(user_email && user_password)) {
      res.status(400).json({error:"All input is required"});
      return;
    }

    let cookie = req.header('Cookie');

    let loginCount = 0;
    if (cookie) {
      cookie = cookie.split('; ');

      for (let i = 0; i < cookie.length; i++) {
        if (cookie[i].includes('login=')) {
          let temp = cookie[i].split('=');
          loginCount = temp[1];
        }
      }
    }

    if (loginCount >= 5) {
      res.status(400).json({error:"Too many login attempts. Please try again later."});
      return;
    }

    let user = await con.getUser(user_email);

    if (user && (await bcrypt.compare(user_password + user.user_salt, user.user_password))) {
      // Create token
      const token = jwt.sign(
        { user_id: user.user_id, user_email },
        process.env.TOKEN_KEY,
        {
          expiresIn: "15m",
        }
      );

      // save user token
      let output = {
        user_id: user.user_id,
        user_first: user.user_first,
        user_last: user.user_last,
        user_email: user.user_email,
        token: token
      };

      res.cookie('token', token, {
        secure: process.env.NODE_ENV !== 'development',
        httpOnly: true 
      }).status(200).json(output);
    } else {
      loginCount++;

      res.cookie('login', loginCount, {
        secure: true,
        httpOnly: true
      }).status(400).json({error:"Invalid Credentials"});
    }
  } catch (err) {
    console.log(err);
  }
});

app.post('/api/users/names', auth, async(req, res) => {
  try {
    let output = await con.postUserNames(req.body);
    res.status(200).json(output);
  } catch(err) {
    console.log(err);
  }
});

app.post('/api/user/changepassword', auth, async(req, res) => {
  try {
    const { password_current, password_change, password_confirm } = req.body;

    if (!(password_current && password_change && password_confirm)) {
      res.status(400).json({error: "All input is required"});
      return;
    }

    if (password_change !== password_confirm) {
      res.status(400).json({error: "Passwords do not match"});
      return;
    }

    let user = await con.getUser(req.user.user_email);

    if (user && !(await bcrypt.compare(password_current + user.user_salt, user.user_password))) {
      res.status(400).send('Incorrect Password');
      return;
    }

    let salt = crypto.randomBytes(32).toString('hex');
    let encryptedPassword = await bcrypt.hash(password_change + salt, 10);

    let output = await con.changePassword([encryptedPassword, salt, req.user.user_id]);
    res.status(200).json(output);
  } catch(err) {
    console.log(err);
  }
});

app.post('/api/user/logout', auth, async(req, res) => {
  try {
    res.clearCookie('token').status(200).json({ status: true });
  } catch (err) {
    console.log(err);
  }
});

// index page
app.get('/', auth, function(req, res) {
  res.render('pages/index');
});

app.listen(port, () => {
  console.log('Server is listening http://localhost:' + port);
});