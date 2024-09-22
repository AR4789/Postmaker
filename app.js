const express=require("express");
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




app.get("/", (req,res)=>{
    res.render("login");

})

app.get("/profile/upload", (req,res)=>{
    res.render("profileupload");

})


app.post("/upload", upload.single("image"), isLoggedIn ,async (req,res)=>{
    let user= await userModel.findOne({email:req.user.email})
    user.profilepic=req.file.filename;
    await user.save();
    res.redirect("/profile");

})

app.get("/login", (req,res)=>{
    res.render("login");

})

app.get("/register", (req,res)=>{
  res.render("register");
})
app.get("/profile", isLoggedIn,async (req,res)=>{
    let user= await userModel.findOne({email:req.user.email}).populate("posts");
    res.render("profile", {user});
    
})

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

app.post("/post", isLoggedIn,async (req,res)=>{
    let user= await userModel.findOne({email:req.user.email});
    let {content}=req.body;
    let post= await postModel.create({
        user:user._id,
        content
    })

    user.posts.push(post._id);
    await user.save()
    res.redirect("profile");
    
})
 
app.post("/register", async(req,res)=>{
    let{email,password,username,name,age}=req.body;
   let user= await userModel.findOne({email});
   if(user)
    return res.status(500).send("User already registered");
   
   bcrypt.genSalt(10, (err,salt)=>{
    bcrypt.hash(password, salt, async (err,hash)=>{
       let user= await userModel.create({
            username,
            name,
            email,
            age,
            password:hash
        });
        
        let token=jwt.sign({email:email, userid:user._id},"shhhh");
        res.cookie("token",token);
     //   res.send("registered");
     req.flash('success', 'User registered. Please login to continue.');

        res.redirect("login");
    })
   })
})

app.post("/login",  async(req,res)=>{
    let{email,password}=req.body;
   let user= await userModel.findOne({email});
   if(!user)
    return res.status(500).send("Email or password is incorect");

       bcrypt.compare(password, user.password, (err,result)=>{
        if(result)
        {
            let token=jwt.sign({email:email, userid:user._id},"shhhh");
            res.cookie("token",token);
            res.status(200).redirect("/profile");
      
        }
        else
          res.redirect("/login")
       })
        
})


app.get("/logout", (req,res)=>{
    res.cookie("token","");
    res.redirect("/login");
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
    let user = await userModel.findOne({ email: req.user.email });
    user.profilepic = req.file.filename;
    await user.save();
    res.json({ success: true, filename: req.file.filename });
});



function isLoggedIn(req,res,next){
    if(req.cookies.token ==="")
        res.redirect("/login");
    else{
   let data= jwt.verify(req.cookies.token, "shhhh")
    req.user=data;
    next();

    }

}

app.listen(3000);