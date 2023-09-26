const express=require("express")
const path=require("path")
const sqlite3=require("sqlite3")
const {open}=require("sqlite")
const bcrypt=require("bcrypt");
const jwt=require("jsonwebtoken");

const app=express();
app.use(express.json());

const dbPath=path.join(__dirname,"twitterClone.db");


let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB ERROR: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//getting array of user following ID s 

const getFollowingPeopleIdsOfUser=async(username)={
    const pavan=`
    SELECT 
       following_user_id FROM follower 
    INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE user.username="${username}";
    `;

    const followingPeople=await db.all(pavan);
    const arrayOfIds=followingPeople.map(
        (eachUser)=>eachUser.following_user_id
    );

  return arrayOfIds;
}

//jwtTokenVerification
const authenticateToken = (request, response, next) => {
  
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
      jwt.verify(jwtToken,"SECRET_KEY",(error,payload)=>{
          if(error){
              response.status(401);
              response.send("Invalid JWT Token")
          }else{
              request.username=payload.username;
              request.userId=payload.userId;
              next()
          }
      })
  }else{
      response.status(401)
      response.send("Invalid JWT Token")
  }
};

//tweet access verification 
const tweetAccessVerification=async(request,response,next)=>{
    const {userId}=request;
    const {tweetId}=request.params;
    const getTweetQuery=`
    SELECT * 
    FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE tweet.tweet_id ="${tweetId}" AND follower_user_id= "${userId}";
    `;

    const tweet=await db.get(getTweetQuery);
    if(tweet===undefined){
        response.status(401)
        response.send("Invalid Request")
    }else{
        next()
    }
};

//API - 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username="${username}";`;
 
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO 
              user (name,username,password,gender) 
            VALUES("${name}","${username}","${hashedPassword}","${gender}");`;
            await db.run(createUserQuery);
           response.status(200);
           response.send("User created successfully");
    }
    
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API-2 

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username= "${username}";
    `;
  
  const userDbDetails = await db.get(selectUserQuery);
  
  if (userDbDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, userDbDetails.password);
    if (isPasswordMatched === true) {
        const payload={username,userId:userDBDetails.user_id};
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({jwtToken});
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3 

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { username} = request;

  const followingPeopleIds=await getFollowingPeopleIdsOfUser(username);

  const getTweetsFeedQuery = `
    SELECT  
        username,
        tweet,
        date_time AS dateTime 
    FROM 
      follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id INNER JOIN user ON user.user_id=tweet.user_id INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE 
       follower.follower_user_id=${followingPeopleIds}
    ORDER BY 
         date_time DESC 
    LIMIT 4 ;
    `;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API-4 

app.get("/user/following", authenticateToken, async (request, response) => {

  const {username,userId} = request;


  const userFollowsQuery = `
    SELECT  
        name
    FROM 
      user INNER JOIN follower ON user.user_id=follower.following_user_id
    WHERE 
       follower.follower_user_id=${userId}
    `;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

// API-5

app.get("/user/followers", authenticateToken, async (request, response) => {
  const {username,userId} = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowsQuery = `
    SELECT DISTINCT 
        name
    FROM 
      user INNER JOIN follower ON user.user_id=follower.following_user_id
    WHERE 
       follower.follower_user_id=${userId}
    `;
  const userFollowersArray = await db.all(userFollowsQuery);
  response.send(userFollowersArray);
});

//API-6

app.get("/tweets/:tweetId", authenticateToken,tweetAccessVerification, async (request, response) => {
  const {username,userId} = request;
  const {tweetId}=request.params;
    const getTweetDetailsQuery = `
             SELECT tweet ,
             (SELECT COUNT() FROM like WHERE tweet_id="${tweetId}") AS likes ,
             (SELECT COUNT()) FROM reply WHERE tweet_id="${tweetId}") AS replies,
             date_times AS dateTime 
             FROM tweet 
             WHERE tweet.tweet_id="${tweetId}" ;
        `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
//API 7 

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery=`
    SELECT username 
    FROM user INNER JOIN like ON user.user_id=like.user_id 
    WHERE tweet_id="${tweetId}";
    `;
    const likedUsers=await db.all(getLikesQuery);
    const usersArray=likedUsers.map(eachUser)=> eachUser.username);
    response.send({likes:usersArray})
    
  });

//API-8 

app.get("/tweets/:tweetId/replies",tweetAccessVerification, authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getRepliedQuery=`
  SELECT name,reply 
  FROM user INNER JOIN reply ON user.user_id=reply.user_id 
  WHERE tweet_id="${tweetId}";
  `;
  const repliedUsers=await db.all(getRepliedQuery);
  response.send({replies:repliedUsers})
});
  

//API-9
app.get("user/tweets", authenticateToken, async (request, response) => {
  const { userId} = request;
  

  //response .send
  const getTweetsDetailsQuery = `
    SELECT  
        tweet.tweet AS tweet,
        COUNT(DISTINCT(like.like_id)) AS likes l
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM 
      user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN like ON like ON like.tweet_id=tweet.tweet_id INNER JOIN reply ON reply.tweet_id=tweet.tweet_id
    WHERE 
       user.user_id=${userId}
    group by 
     tweet.tweet_id
    `;
  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

//API -10
app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId=parseInt(request.userId);
  const dateTime=new Date().toJSON().substring(0,19).replace("T" ," ");
  const postTweetQuery = `
    INSERT INTO tweet 
    (tweet,user_id,date_time)
    VALUES("${tweet}","${userId}","${dateTime}");`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//api -11
app.delete("/user/tweets", authenticateToken, async (request, response) => {

  const { tweetId } = request.params;
  const { userId } = request;


  const SelectUserQuery = `select * from tweet where tweet.user_id=${userId} AND tweet.tweet_id=${tweetId};
    `;
  const tweetUser = await db.all(selectUserQuery);

  if (tweetUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
    DELETE FROM tweet 
    WHERE 
         tweet.tweet_id=${tweetId};
    `;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
