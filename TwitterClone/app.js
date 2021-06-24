const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user_id = payload.user_id;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const selectUserQuery = `SELECT * from user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const encryptedPassword = await bcrypt.hash(password, 10);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        INSERT INTO user(username,password,name,gender) VALUES(
            '${username}',
            '${encryptedPassword}',
            '${name}',
            '${gender}'
        );
      `;

      const dbResponse = await db.run(createUserQuery);
      const userId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * from user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        user_id: dbUser.user_id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({
        jwtToken,
      });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// twitter feed

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { user_id } = request;
  const selectUserQuery = `
    SELECT
         T.name as username, tweet.tweet as tweet, tweet.date_time as dateTime
    FROM
         (follower JOIN user ON follower.following_user_id = user.user_id) as T 
         JOIN tweet ON T.following_user_id=tweet.user_id  where T.follower_user_id = ${user_id} 
    ORDER BY dateTime DESC LIMIT 4;`;

  const userDetails = await db.all(selectUserQuery);
  response.send(userDetails);
});

// user following

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { user_id } = request;
  const selectUserQuery = `
    SELECT name FROM user join follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${user_id};
  `;
  const userDetails = await db.all(selectUserQuery);
  response.send(userDetails);
});

// user followers

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { user_id } = request;
  const selectUserQuery = `
    SELECT name from follower join user on follower_user_id = user_id where follower.following_user_id=${user_id};
  `;
  const userDetails = await db.all(selectUserQuery);
  response.send(userDetails);
});

// get a tweet

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { user_id } = request;
  const { tweetId } = request.params;
  const selectUserQuery = `
  SELECT tweet,
   (SELECT count(*) from tweet join like on tweet.tweet_id = like.tweet_id where tweet.tweet_id=${tweetId}) as likes,
   (SELECT count(*) from tweet join reply on tweet.tweet_id = reply.tweet_id where tweet.tweet_id=${tweetId}) as replies,
   date_time as dateTime
   from tweet where tweet_id=${tweetId}
   AND
   user_id in (
       SELECT follower.following_user_id FROM follower WHERE follower_user_id=${user_id}
   );
  `;
  const userDetails = await db.get(selectUserQuery);
  if (userDetails !== undefined) {
    response.send(userDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// get tweet likes

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `
    SELECT username from like join user on user.user_id = like.user_id
    where tweet_id=
    (
       SELECT tweet_id FROM follower join tweet on tweet.user_id = following_user_id
       WHERE follower_user_id=${user_id} and tweet_id=${tweetId}
   );
  `;
    const userDetails = await db.all(selectUserQuery);
    if (userDetails.length !== 0) {
      const likesArray = userDetails.map((eachItem) => {
        return eachItem.username;
      });
      response.send({
        likes: likesArray,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get tweet replies

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `
    SELECT username,reply from reply join user on user.user_id = reply.user_id
    where tweet_id=
    (
       SELECT tweet_id FROM follower join tweet on tweet.user_id = following_user_id
       WHERE follower_user_id=${user_id} and tweet_id=${tweetId}
   );
  `;
    const userDetails = await db.all(selectUserQuery);
    if (userDetails.length !== 0) {
      const repliesArray = userDetails.map((eachItem) => {
        return { name: eachItem.username, reply: eachItem.reply };
      });
      response.send({
        replies: repliesArray,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get user tweets

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { user_id } = request;
  const selectUserQuery = `
  SELECT tweet,(
   SELECT count(like_id) from like WHERE like.tweet_id=tweet.tweet_id) as likes,
   (SELECT count(reply_id) from reply WHERE reply.tweet_id=tweet.tweet_id) as replies,
   date_time as dateTime
   from tweet where user_id=${user_id}
   ;
  `;
  const userDetails = await db.all(selectUserQuery);
  response.send(userDetails);
});

// create a tweet

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { user_id } = request;
  const { tweet } = request.body;
  const dateObj = new Date(Date.now());
  const formattedDate = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDay()}`;
  const createTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time)
    Values(
        '${tweet}',
        ${user_id},
        ${String(formattedDate)}
    )
  `;
  const tweetDetails = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// delete tweet API

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const checkUserQuery = `
        SELECT * from tweet WHERE tweet_id=${tweetId} AND user_id=${user_id};
    `;
    const isValidUser = await db.get(checkUserQuery);
    if (isValidUser !== undefined) {
      const deleteQuery = `
        DELETE from tweet
        WHERE tweet_id = ${tweetId};
    `;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
