const jwt = require("jsonwebtoken");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const user = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      provider: "google",
    };

    const jwtToken = jwt.sign(user, process.env.JWT_SECRET || "SECRET_KEY", { expiresIn: "1d" });

    res.json({ token: jwtToken, user });
  } catch (error) {
    
    res.status(401).json({ message: "Google authentication failed" });
  }
};

const facebookLogin = async (req, res) => {
  try {
    const { accessToken, userID } = req.body;

    const fbRes = await axios.get(`https://graph.facebook.com/v18.0/${userID}`, {
      params: { fields: "id,name,email,picture", access_token: accessToken },
    });

    const user = {
      name: fbRes.data.name,
      email: fbRes.data.email || null,
      picture: fbRes.data.picture?.data?.url,
      provider: "facebook",
    };

    const jwtToken = jwt.sign(user, process.env.JWT_SECRET || "SECRET_KEY", { expiresIn: "1d" });

    res.json({ token: jwtToken, user });
  } catch (error) {
    
    res.status(401).json({ message: "Facebook authentication failed" });
  }
};

module.exports = { googleLogin, facebookLogin };
