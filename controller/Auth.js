const { User } = require('../model/User');
const crypto = require('crypto');
const { sanitizeUser, sendMail } = require('../services/common');
const jwt = require('jsonwebtoken');
const axios = require('axios');

var springedge = require('springedge');

exports.createUser = async (email, tempPass) => {
  try {
    const salt = crypto.randomBytes(16);
    crypto.pbkdf2(
      tempPass,
      salt,
      310000,
      32,
      'sha256',
      async function (err, hashedPassword) {
        const user = new User({ email, password: hashedPassword, salt });
        const doc = await user.save();

        req.login(doc, (err) => {
          // this also calls serializer and adds to session
          if (err) {
            res.status(400).json(err);
          } else {
            const token = jwt.sign(
              sanitizeUser(doc),
              process.env.JWT_SECRET_KEY
            );
            res
              .cookie('jwt', token, {
                expires: new Date(Date.now() + 3600000),
                httpOnly: true,
              })
              .status(201)
              .json({ id: doc.id, role: doc.role });
          }
        });
      }
    );
  } catch (err) {
    res.status(400).json(err);
  }
};

// Function to generate access token using refresh token
async function generateAccessToken() {
  const tokenResponse = await axios.post('https://accounts.zoho.in/oauth/v2/token?', null, {
    params: {
      grant_type: 'refresh_token',
      client_id: '1000.623LGEAT6EH7D7MKYFT20I6FRHCFIJ',
      client_secret: '1e6e59073d1c11fbc8ae7c757626932f02f6b2e41c',
      redirect_uri: 'https://www.employeeform.in/callback',
      refresh_token: '1000.bc9ce8fad3c4799e7ef89ff6200527a1.8311e0aed6efd7bc90c057b89c5b9cdf'
    },
    headers: {
      'Cookie': 'JSESSIONID=74ACBC7D19F9F610DC1BA4271951A273; _zcsr_tmp=7ace336c-aad9-474c-814c-7b1d026f5eb6; iamcsr=7ace336c-aad9-474c-814c-7b1d026f5eb6; zalb_6e73717622=4440853cd702ab2a51402c119608ee85'
    }
  })
  // .then(function(response){
  //   console.log(response.request.socket.remoteAddress);
  // });

  return tokenResponse.data.access_token;
}

// Function to fetch employee records from Zoho
async function fetchEmployeeRecords(accessToken, sIndex = 0) {
  const recordsResponse = await axios.get('https://people.zoho.in/people/api/forms/employee/getRecords', {
    params: {
      sIndex: sIndex,
      limit: 200
    },
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`
    }
  });
  return recordsResponse.data.response.result;
}

// Helper function to fetch all employee records in batches
async function fetchAllEmployeeRecords(accessToken) {
  let allRecords = [];
  let sIndex = 0;
  let hasMoreRecords = true;

  while (hasMoreRecords) {
    const recordsBatch = await fetchEmployeeRecords(accessToken, sIndex);
    allRecords = allRecords.concat(recordsBatch);
    sIndex += 200;
    if (recordsBatch.length < 200) {
      hasMoreRecords = false;
    }
  }

  return allRecords;
}

// Function to get email by official name from Zoho records
function getEmailByOfficialName(employeeRecords, userEmail) {
  for (const emp of employeeRecords) {
    const empDetails = Object.values(emp)[0][0];
    if (empDetails.EmailID === userEmail) {
      return empDetails.EmailID;
    }
  }
  return null;
}

exports.loginUser = async (req, res) => {
  const user = req.user;

  const userEmail = req.body.email;

  if (userEmail === 'facilities.mumbai@tataplayfiber.com') {
    // Allow direct access for this specific email
    let user = await User.findOne({ email: userEmail });
    const token = jwt.sign(sanitizeUser(user), process.env.JWT_SECRET_KEY);
    res
      .cookie('jwt', token, {
        expires: new Date(Date.now() + 3600000),
        httpOnly: true,
      })
      .status(201)
      .json({ email: userEmail, role: user.role, verified: true });
    return;
  }

  const loginFromDB = await User.findOne({ email: userEmail });
  if(loginFromDB) {
    let user = await User.findOne({ email: userEmail });
    const token = jwt.sign(sanitizeUser(user), process.env.JWT_SECRET_KEY);
    res
      .cookie('jwt', token, {
        expires: new Date(Date.now() + 3600000),
        httpOnly: true,
      })
      .status(201)
      .json({ email: userEmail, role: user.role, verified: true });
    return;
  } else {
      // ---Zoho connection
    const accessToken = await generateAccessToken();
    // const employeeRecords = await fetchEmployeeRecords(accessToken);
    const employeeRecords = await fetchAllEmployeeRecords(accessToken);

    const emailFromZoho = getEmailByOfficialName(employeeRecords, userEmail);
    if (!emailFromZoho) {
      console.log("Unauthorized: Email not found in Zoho records")
      // return
      // return res.status(401).send('Unauthorized: Email not found in Zoho records');
    } else {
      const userDetails = exports.currentLoggedInUserDetails(employeeRecords, emailFromZoho);

      const searchEmailInDB = await User.findOne({ email: emailFromZoho });

      if(searchEmailInDB) {       
        // Update the user's address if the addresses array is null or empty
        if (!searchEmailInDB.addresses || searchEmailInDB.addresses.length === 0) {
          searchEmailInDB.addresses = [{
            name: userDetails.Official_Name,
            email: userDetails.EmailID,
            phone: userDetails.Mobile,
            street: userDetails.Current_Address1,
            city: userDetails.Work_location,
            state: userDetails.Work_location,
            pinCode: userDetails.Current_Pincode
          }];

          const lowerValue = userDetails.Expense_Policy1.toLowerCase().trim();

          if (lowerValue.includes('non field')) {
            let jRole = 'nonField';
            searchEmailInDB.jobRole = jRole;
            await searchEmailInDB.save();
          } else {
            let jRole = 'field';
            searchEmailInDB.jobRole = jRole;
            await searchEmailInDB.save();
          }
        }

        const generatedOtp = params.message
        if(req.body.password === generatedOtp) {
          res
          .cookie('jwt', user.token, {
            expires: new Date(Date.now() + 3600000),
            httpOnly: true,
          })
          .status(201)
          .json({ id: user.id, role: user.role, verified: true });
        } else {
          console.log("This is login error status")
          res.sendStatus(401);
        }
        return
      }
    }
  }
};

exports.currentLoggedInUserDetails = (employeeRecords, emailFromZoho) => {
  for (const emp of employeeRecords) {
    const empDetails = Object.values(emp)[0][0];
    if (empDetails.EmailID === emailFromZoho) {
      return empDetails;
    }
  }
  return null;
}

exports.logout = async (req, res) => {
  res
    .cookie('jwt', null, {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .sendStatus(200)
};

exports.checkAuth = async (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    console.log("This is checkAuth error status")
    res.sendStatus(401);
  }
};

exports.resetPasswordRequest = async (req, res) => {
  const email = req.body.email;
  const user = await User.findOne({ email: email });
  if (user) {
    const token = crypto.randomBytes(48).toString('hex');
    user.resetPasswordToken = token;
    await user.save();

    // Also set token in email
    const resetPageLink =
      'http://localhost:3000/reset-password?token=' + token + '&email=' + email;
    const subject = 'reset password for e-commerce';
    const html = `<p>Click <a href='${resetPageLink}'>here</a> to Reset Password</p>`;

    // lets send email and a token in the mail body so we can verify that user has clicked right link

    if (email) {
      const response = await sendMail({ to: email, subject, html });
      res.json(response);
    } else {
      res.sendStatus(400);
    }
  } else {
    res.sendStatus(400)
  }
};

exports.resetPassword = async (req, res) => {
  const { email, password, token } = req.body;

  const user = await User.findOne({ email: email, resetPasswordToken: token });
  if (user) {
    const salt = crypto.randomBytes(16);
    crypto.pbkdf2(
      req.body.password,
      salt,
      310000,
      32,
      'sha256',
      async function (err, hashedPassword) {
        user.password = hashedPassword;
        user.salt = salt;
        await user.save();
        const subject = 'password successfully reset for e-commerce';
        const html = `<p>Successfully able to Reset Password</p>`;
        if (email) {
          const response = await sendMail({ to: email, subject, html });
          res.json(response);
        } else {
          res.sendStatus(400);
        }
      }
    );
  } else {
    res.sendStatus(400);
  }
};


var params = {
  'apikey': '621492a44a89m36c2209zs4l7e74672cj', // API Key
  'sender': 'SEDEMO', // Sender Name
  'to': [
    '919167499609'  //Moblie Number
  ],
  'message': 'Hello, This is a test message from spring edge',
  'format': 'json'
};

exports.otpVerification = async (req, res) => {
  const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * digits.length);
      otp += digits[randomIndex];
    }
  
  params.message = `${otp}`;
  const email = req.query.email;

  // Send a confirmation mail to user
  const subject = 'ShopHub- Verification OTP';
  // const html = `<p>You OTP is: '${otp}'</p>`;
  const html = generateOTPHTML(otp);
  console.log(otp)
  const response = await sendMail({ to: email, subject, html });
  
  // springedge.messages.send(params, 5000, function (err, response) {
  //   if (err) {
  //     return console.log(err);
  //   }
  // });
}

generateOTPHTML = function(otp){
  return (
    `
    <div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
  <div style="margin:50px auto;width:70%;padding:20px 0">
    <div style="border-bottom:1px solid #eee">
      <a href="" style="font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600">TATA PLAY FIBER</a>
    </div>
    <p>Thank you for choosing ShopHub. Use the following OTP to complete your Login procedure.</p>
    <h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${otp}</h2>
    <p style="font-size:0.9em;">Regards,<br />Admin and Facilities</p>
    <hr style="border:none;border-top:1px solid #eee" />
    <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
      <p>Tata Play Fiber</p>
      <p>Tata Sky Broadband Pvt Ltd.</p>
      <p>Unit No – 306, 3rd Floor, Windsor,</p>
      <p>Off CST Road, Kalina, Santacruz – (East),</p>
      <p>Mumbai 400098. Tel:02262404800</p>
      <p>India</p>
    </div>
  </div>
</div>
    `
  )
}

exports.generateAccessToken = generateAccessToken;
exports.fetchEmployeeRecords = fetchEmployeeRecords;
exports.getEmailByOfficialName = getEmailByOfficialName;
exports.fetchAllEmployeeRecords = fetchAllEmployeeRecords;
