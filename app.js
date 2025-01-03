require('dotenv').config();

const express=require("express");
const {Configuration, OpenAIApi}= require("openai");

const app=express();
const userModel=require("./models/user");
const cookies = require("cookie-parser");
const bcrypt=require("bcrypt")
const jwt=require("jsonwebtoken")
const postModel=require("./models/post")
const upload=require("./config/multerconfig")
const path=require("path");
const session=require("express-session");
const  flash=require("connect-flash"); 
const user = require("./models/user");
const chatModel=require("./models/chat");
const server = require('http').createServer(app);
const io = require('socket.io')(server)
const multer = require('multer');
const crypto=require("crypto");
const axios = require('axios');
const fs = require('fs');





app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(cookies());
app.use(express.static(path.join(__dirname,"public")));
app.use(flash())
app.use(session({ secret: 'secret', resave: true, saveUninitialized: true }));
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});
app.use((req, res, next) => {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    next();
  });



 //In your server-side code
 io.on('connection', (socket) => {
    console.log('Client connected');

    // Listen for room joining
    socket.on('join', async (roomId) => {
        try {
            socket.join(roomId);
            console.log(`User joined room: ${roomId}`);

            const friendId = socket.handshake.query.friendId;
            const friend = await userModel.findById(friendId);

            let userId;
            if (roomId.split('-')[0] === friendId) {
                userId = roomId.split('-')[1];
            } else {
                userId = roomId.split('-')[0];
            }

            if (friend) {
                const messages = friend.messages?.filter(msg => 
                    msg.friendId && msg.friendId.toString() === userId
                );
                socket.emit('messages', messages || []);
            } else {
                console.log('Friend not found');
                socket.emit('messages', []);
            }
        } catch (err) {
            console.error('Error joining room:', err);
        }
    });

    // Listen for incoming messages
    socket.on('message', async (data) => {
        console.log(`Received message: ${data.message}`);
        const { roomId, sender, message } = data;

        try {
            const friendId = socket.handshake.query.friendId;
            const friend = await userModel.findById(friendId);

            let userId;
            if (roomId.split('-')[0] === friendId) {
                userId = roomId.split('-')[1];
            } else {
                userId = roomId.split('-')[0];
            }

            // Update the friend's message data
            if (friend) {
                const messageIndex = friend.messages.findIndex(msg => 
                    msg.friendId && msg.friendId.toString() === userId
                );
                if (messageIndex === -1) {
                    friend.messages.push({
                        friendId: userId,
                        lastMessage: message,
                        timestamp: new Date(),
                        unseenCount: 1
                    });
                } else {
                    friend.messages[messageIndex].lastMessage = message;
                    friend.messages[messageIndex].timestamp = new Date();
                    friend.messages[messageIndex].unseenCount++;
                }
                await friend.save();
            }

            // Update the sender's message data
            const senderUser = await userModel.findById(userId);
            const messageIndexSender = senderUser.messages.findIndex(msg => 
                msg.friendId && msg.friendId.toString() === friendId
            );
            if (messageIndexSender === -1) {
                senderUser.messages.push({
                    friendId: friendId,
                    lastMessage: message,
                    timestamp: new Date(),
                    unseenCount: 0
                });
            } else {
                senderUser.messages[messageIndexSender].lastMessage = message;
                senderUser.messages[messageIndexSender].timestamp = new Date();
                senderUser.messages[messageIndexSender].unseenCount = 0;
            }
            await senderUser.save();

            // Broadcast the new message to all connected clients in the room
            io.to(roomId).emit('message', { sender, content: message });
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});





app.get("/", async(req,res)=>{
    try {
        let user= await userModel.find({});

        // Fetch top 5 trending posts based on likes and creation date
        let trendingPosts = await postModel.find({})
            .sort({ likes: -1, date: -1 })
            .limit(5)
            .populate("user");
        res.render("login", { trendingPosts,user });
    } catch (err) {
        console.error("Error fetching trending posts:", err);
        res.render("login", { trendingPosts: [] , user});
    }
});

app.get("/profile/upload", (req,res)=>{
    res.render("profileupload");

})


app.post("/upload", upload.single("image"), isLoggedIn ,async (req,res)=>{
    let user= await userModel.findOne({email:req.user.email})
    user.profilepic=req.file.filename;
    await user.save();
    res.redirect("/profile");

})




app.get("/register", (req,res)=>{
  res.render("register");
})

app.get("/profile", isLoggedIn, async (req, res) => {
    // Find the user by email and populate the posts and friends
    let user = await userModel.findOne({ email: req.user.email })
        .populate({
            path: 'posts', // Populate the 'posts' of the user
            populate: { path: 'user', model: 'user' } // Populate the 'user' field inside each post
        })
        .populate({
            path: 'friends', // Populate the 'friends' of the user
            populate: {
                path: 'posts', // Populate the 'posts' of each friend
                populate: { path: 'user', model: 'user' } // Populate the 'user' field inside each friend's post
            }
        });

    // Find the user's friends and populate their posts
    let friends = await userModel.find({ _id: { $in: user.friends } }).populate({
        path: 'posts',
        populate: { path: 'user', model: 'user' } // Populate the 'user' field inside each friend's post
    });

    // Combine posts from user and friends
    let allPosts = [...user.posts, ...friends.reduce((acc, friend) => acc.concat(friend.posts), [])];

    // Sort posts by creation time
    allPosts.sort((a, b) => b.date - a.date);

    // Render the profile page with the sorted posts
    res.render("profile", { user, posts: allPosts });
});


app.post("/like/:id", isLoggedIn, async (req, res) => {
    let post = await postModel.findOne({ _id: req.params.id }).populate("user");
  
    const index = post.likes.indexOf(req.user.userid);
  
    if (index === -1) {
      post.likes.push(req.user.userid);
    } 
    else {
      post.likes.splice(index, 1);
    }
  
    await post.save();
  
    res.json({ message: "Like updated successfully",  likes: post.likes.length });
  });
  
  app.delete("/like/:id", isLoggedIn, async (req, res) => {
    let post = await postModel.findOne({ _id: req.params.id }).populate("user");
  
    const index = post.likes.indexOf(req.user.userid);
  
    if (index !== -1) {
      post.likes.splice(index, 1);
    }
  
    await post.save();
  
    res.json({ message: "Like removed successfully", likes: post.likes.length });
  });

  app.delete("/delete/:id", isLoggedIn, async (req, res) => {
    try {
        // Find the post by ID and delete it
        const post = await postModel.findByIdAndDelete(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        // Find the user and remove the post ID from the user's posts array
        const user = await userModel.findOne({ _id: req.user.userid });
        const postIndex = user.posts.indexOf(req.params.id);

        if (postIndex !== -1) {
            user.posts.splice(postIndex, 1);
            await user.save(); // Save the updated user
        }

        res.json({ message: "Post removed successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server error while deleting post" });
    }
});




app.get("/edit/:id", isLoggedIn,async (req,res)=>{
    let post= await postModel.findOne({_id: req.params.id}).populate("user");

    

    res.render("edit",{post});
    
})

app.post("/update/:id", isLoggedIn,async (req,res)=>{
    let post= await postModel.findOneAndUpdate({_id: req.params.id},{content:req.body.content});

    

    res.redirect("/profile");
    
})



const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/images/uploads')
      }, 
      filename: function (req, file, cb) {
          const name=crypto.randomBytes(12, function(err, name){
  
              cb(null, name.toString('hex') + path.extname(file.originalname))
          })
      }
});

const create_post = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
    fileFilter: (req, file, cb) => {
        // Only allow image file types
        const fileTypes = /jpeg|jpg|png|gif/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only images are allowed (jpeg, jpg, png, gif)!'));
        }
    }
}).single('image'); // Accept a single image file

// Post route to handle image and content
app.post("/post", isLoggedIn, async (req, res) => {
    create_post(req, res, async function (err) {
        if (err) {
            return res.status(400).send(err.message);
        }

        try {
            let user = await userModel.findOne({ email: req.user.email });
            let { header,content } = req.body;

            // If an image was uploaded, read it as a Base64 string
            let imageBase64 = req.file ? fs.readFileSync(req.file.path, { encoding: 'base64' }) : null;

            // Create the post with both content and image Base64 string
            let post = await postModel.create({
                user: user._id,
                header,
                content,
                image: imageBase64 // Save the image as Base64 string in the post
            });

            user.posts.push(post._id);
            await user.save();

            // Optionally delete the file from disk if you're not using it anymore
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }

            res.redirect("profile");
        } catch (error) {
            console.error("Error creating post:", error);
            res.status(500).send("Internal Server Error");
        }
    });
});

 
app.post("/register", async(req,res)=>{
    let{email,password,username,name,age,messages}=req.body;
   let user = await userModel.findOne({ $or: [{ email }, { username }] });
   if (user) {
       if (user.email === email) {
           req.flash("error", "Email already registered.");
       } else if (user.username === username) {
           req.flash("error", "Username already taken.");
       }
       return res.redirect("/register"); // Redirect back to the registration page
   }
   bcrypt.genSalt(10, (err,salt)=>{
    bcrypt.hash(password, salt, async (err,hash)=>{
       let user= await userModel.create({
            username,
            name,
            email,
            age,
            password:hash,
            messages:[]
        });
        
        let token=jwt.sign({email:email, userid:user._id},"shhhh");
        res.cookie("token",token);
     //   res.send("registered");
     req.flash('success', 'User registered. Please login to continue.');

        res.redirect("/");
    })
   })
})

app.post("/login", async (req, res) => {
    let { email, password } = req.body;

    try {
        // Find user by either email or username
        let user = await userModel.findOne({email });
        if (!user) {
            req.flash("error", "Email is not registered.");
            return res.redirect("/"); // Ensure redirecting back to the login page
        }
        // Compare the entered password with the hashed password in the database
        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                console.error(err); // Log the error for debugging
                req.flash("error", "Something went wrong. Please try again.");
                return res.redirect("/");
            }

            if (result) {
                // Password matches, generate the token
                let token = jwt.sign({ email , userid: user._id }, "shhhh");

                // Set token as a cookie
                res.cookie("token", token);

                // Redirect to dashboard or another protected page
                return res.redirect("/profile");
            } else {
                req.flash("error", "Entered Password is incorrect.");
                return res.redirect("/");
            }
        });
    } catch (error) {
        console.error(error); // Log the error for debugging
        req.flash("error", "An unexpected error occurred. Please try again.");
        res.redirect("/login");
    }
});





app.get("/logout", (req,res)=>{
    res.cookie("token","");
    res.redirect("/");
})

// Route to render 'My Profile' with user details
app.get("/myprofile", isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({ email: req.user.email });
    res.render("myprofile", { user });
});

// Route to render 'My Posts' with user's posts
// Route to render 'My Posts' with user's posts
app.get("/myposts", isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({ email: req.user.email }).populate("posts");
    res.render("myposts", { user }); // Pass the user object to the template
});


app.get("/create/post", isLoggedIn, async (req,res) =>{
    let user= await userModel.findOne({email:req.user.email}).populate("posts");
    res.render("post", {user})
})




// Route to render 'Settings' page for dark/light mode toggle
app.get("/settings", isLoggedIn, (req, res) => {
    res.render("settings", { theme: req.cookies.theme || "light" });
});

// Route to handle dark/light mode toggle in settings
app.post("/settings", isLoggedIn, (req, res) => {
    const { theme } = req.body;
    res.cookie("theme", theme); // Store theme preference in cookies
    res.redirect("/settings");
});

app.post("/updateprofile", isLoggedIn, async (req, res) => {
    const { field, value } = req.body;
    let user = await userModel.findOne({ email: req.user.email });

    if (field === "name") {
        user.name = value;
    } else if (field === "age") {
        user.age = value;
    } else if (field === "password") {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(value, salt);
    }

    await user.save();
    res.json({ success: true });
});


app.post("/uploadprofilepic", upload.single("image"), isLoggedIn, async (req, res) => {
    try {
        let user = await userModel.findOne({ email: req.user.email });

        // Read the image file as a Base64 string
        const imageBase64 = fs.readFileSync(req.file.path, { encoding: 'base64' });

        // Store the Base64 image string in the database
        user.profilepic = imageBase64;
        await user.save();

        // Optionally, delete the file from disk if you're not using it anymore
        fs.unlinkSync(req.file.path);

        res.json({ success: true, image: imageBase64 });
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

app.get("/search", isLoggedIn, async (req, res) => {
    const searchQuery = req.query.q;
    const self=req.user.userid;
    
    try {
        // Search for users whose username matches the search query exactly
        const users = await userModel.find({ username: { $eq: searchQuery } }).populate("friends");
        console.log(users);

        // Fetch the logged-in user's details
        const user = await userModel.findById(req.user.userid).populate("friendRequests").populate("friends");

        res.render("friends", { users, user, searchQuery,self });
    } catch (err) {
        console.error("Error searching for users:", err);
        res.status(500).send("Error occurred while searching for users.");
    }
});

app.post("/friend-request/:id", isLoggedIn, async (req, res) => {
    try {
        const recipient = await userModel.findById(req.params.id);
        
        if (!recipient.friendRequests.includes(req.user.userid)) {
            recipient.friendRequests.push(req.user.userid);
            await recipient.save();
            res.status(200).json({ message: "Friend request sent successfully" });
        } else {
            res.status(400).json({ message: "Friend request already sent" });
        }
    } catch (err) {
        console.error("Error sending friend request:", err);
        res.status(500).json({ message: "Error occurred while sending friend request." });
    }
});

app.get("/friends", isLoggedIn, async (req, res) => {
    try {
        const searchQuery = req.query.q;

        // Fetch the logged-in user and populate both friendRequests and friends
        const user = await userModel.findOne({ _id: req.user.userid })
            .populate("friendRequests", "username") // Only retrieve the username field for friend requests
            .populate("friends"); // Only retrieve the username field for friends

        // Fetch users for search results, excluding the current user
        const users = await userModel.find({ _id: { $ne: req.user.userid } });

        res.render("friends", { user, user,searchQuery });
    } catch (err) {
        console.error("Error fetching friend requests:", err);
        res.status(500).send("Error occurred while fetching friend requests.");
    }
});




  app.post("/accept-request/:id", isLoggedIn, async (req, res) => {
    try {
      const user = await userModel.findById(req.user.userid);
      const newFriend = await userModel.findById(req.params.id);
  
      // Add the new friend to both users' friends array
      user.friends.push(newFriend._id);
      newFriend.friends.push(user._id);
  
      // Remove the friend request from the user's friendRequests array
      user.friendRequests = user.friendRequests.filter(requestId => requestId.toString() !== req.params.id);
  
      await user.save();
      await newFriend.save();
       
      res.redirect("/friends");
    } catch (err) {
      console.error("Error accepting friend request:", err);
      res.status(500).send("Error occurred while accepting friend request.");
    }
  });
  
  app.post("/reject-request/:id", isLoggedIn, async (req, res) => {
    try {
      const user = await userModel.findById(req.user.userid);
  
      // Remove the friend request from the user's friendRequests array
      user.friendRequests = user.friendRequests.filter(requestId => requestId.toString() !== req.params.id);
  
      await user.save();
      res.redirect("/friends");
    } catch (err) {
      console.error("Error rejecting friend request:", err);
      res.status(500).send("Error occurred while rejecting friend request.");
    }
  });
  

  app.post('/delete-friend/:friendId', isLoggedIn, async (req, res) => { 
    const friendId = req.params.friendId;
    try {
        // Remove the friend from the user's friends list
        const user = await userModel.findById(req.user.userid);
        const userFriend = await userModel.findById(friendId);

        user.friends.pull(friendId);
        await user.save();

        userFriend.friends.pull(req.user.userid);
        await userFriend.save();

        res.status(200).send('Friend deleted successfully');
    } catch (error) {
        console.error('Error deleting friend:', error);
        res.status(500).send('Error deleting friend');
    }
});

app.get('/chat/:friendId', isLoggedIn, async (req, res) => {
    const friendId = req.params.friendId;
    const user = await userModel.findById(req.user.userid);
    const friend = await userModel.findById(friendId);
    const serverURL= process.env.SERVER_URL || "http://localhost:3000";


    // Fetch messages between the logged-in user and the friend
    const messages = await chatModel.find({
        $or: [
            { sender: req.user.userid, receiver: friendId },
            { sender: friendId, receiver: req.user.userid }
        ]       
    }).populate('sender receiver'); // Populate the sender and receiver fields

    res.render('chat', { messages, user, friend,serverURL });
});


app.post('/updatepassword', isLoggedIn, async (req, res) => {
    const { password } = req.body;
    
    try {
        // Hash the password with bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Assuming you have a way to identify the logged-in user, e.g., req.user._id
        const userId = req.user.userid; // This assumes you have user authentication in place

        // Update the user's password in the database
        await userModel.findByIdAndUpdate(userId, { password: hashedPassword });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating password:', error);
        res.json({ success: false });
    }
});



  function isLoggedIn(req, res, next) {
    const token = req.cookies.token;
    if (token) {
        try {
            let data = jwt.verify(token, "shhhh");
            req.user = data;
            if (req.url === '/') {
                return res.redirect('/profile');
            }
            next();
        } catch (err) {
            return res.redirect("/");
        }
    } else {
        if (req.url === '/') {
            next();
        } else {
            return res.redirect("/");
        }
    }
}



server.listen(3000, () => {
    console.log('Server listening on port 3000');
});